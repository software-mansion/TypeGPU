#!/usr/bin/env node
/**
 * Converts an OBJ file to a binary meshlet file for GPU meshlet rendering.
 *
 * Output binary format (.meshlets):
 *
 * Header (8 × u32 = 32 bytes):
 *   [0] magic:                 u32 = 0x4C54534D ("MSTL" LE)
 *   [1] version:               u32 = 1
 *   [2] vertex_count:          u32
 *   [3] meshlet_count:         u32
 *   [4] meshlet_vertex_count:  u32  (length of meshlet_vertices array)
 *   [5] meshlet_triangle_bytes:u32  (length of meshlet_triangles array in bytes)
 *   [6] flags:                 u32  (bit 0 = has_normals)
 *   [7] reserved:              u32
 *
 * Sections (each written consecutively, padded to 4-byte alignment):
 *   positions:          Float32Array [x,y,z] × vertex_count
 *   normals:            Float32Array [nx,ny,nz] × vertex_count  (if has_normals)
 *   meshlets:           Uint32Array [vertex_offset, triangle_offset, vertex_count, triangle_count] × meshlet_count
 *   meshlet_vertices:   Uint32Array × meshlet_vertex_count
 *   meshlet_triangles:  Uint8Array × meshlet_triangle_bytes (padded to multiple of 4)
 *   bounds:             Float32Array [cx,cy,cz,radius, apexX,apexY,apexZ, axisX,axisY,axisZ, cutoff] × meshlet_count
 */

import { readFileSync, writeFileSync } from 'fs';
import { MeshoptClusterizer } from 'meshoptimizer/clusterizer';

const INPUT = new URL('../public/assets/meshlets/sponza.obj', import.meta.url).pathname;
const OUTPUT = new URL('../public/assets/meshlets/sponza.meshlets', import.meta.url).pathname;

const MAX_VERTICES = 64;
const MAX_TRIANGLES = 124;
const CONE_WEIGHT = 0.5;

// ---------------------------------------------------------------------------
// OBJ Parser
// ---------------------------------------------------------------------------
function parseOBJ(text) {
  /** @type {number[]} Raw position list from "v" lines (flat: x,y,z,...) */
  const rawPositions = [];
  /** @type {number[]} Raw normal list from "vn" lines (flat: nx,ny,nz,...) */
  const rawNormals = [];

  /** @type {number[]} Flat interleaved vertex buffer [x,y,z,nx,ny,nz,...] */
  const vertexData = [];
  /** @type {number[]} Index buffer */
  const indices = [];

  /** Maps OBJ token "pi/ni" → flat vertex index */
  const vertexMap = new Map();

  let hasNormals = false;

  let cursor = 0;
  const len = text.length;

  while (cursor < len) {
    const eol = text.indexOf('\n', cursor);
    const lineEnd = eol === -1 ? len : eol;
    // Trim leading whitespace manually for speed
    let lineStart = cursor;
    while (
      lineStart < lineEnd &&
      (text.charCodeAt(lineStart) === 32 || text.charCodeAt(lineStart) === 9)
    ) {
      lineStart++;
    }
    cursor = eol === -1 ? len : eol + 1;

    if (lineStart >= lineEnd) {
      continue;
    }
    const ch0 = text.charCodeAt(lineStart);
    if (ch0 === 35) {
      // '#'
      continue;
    }

    if (ch0 === 118) {
      // 'v'
      const second = text.charCodeAt(lineStart + 1);
      if (second === 32 || second === 9) {
        // 'v ' or 'v\t'
        const line = text.substring(lineStart + 2, lineEnd).trim();
        const parts = line.split(/\s+/);
        rawPositions.push(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]));
        continue;
      }
      if (second === 110) {
        // 'vn'
        const line = text.substring(lineStart + 3, lineEnd).trim();
        const parts = line.split(/\s+/);
        rawNormals.push(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]));
        hasNormals = true;
        continue;
      }
      continue;
    }

    if (ch0 === 102) {
      // 'f'
      const second = text.charCodeAt(lineStart + 1);
      if (second !== 32 && second !== 9) {
        continue;
      }
      // Face
      const line = text.substring(lineStart + 2, lineEnd).trim();
      const parts = line.split(/\s+/);
      const faceVerts = [];

      for (let i = 0; i < parts.length; i++) {
        const token = parts[i];
        if (token === '') {
          continue;
        }
        // Extract pi and ni from "pi/ti/ni" or "pi//ni" or "pi/ti" or "pi"
        const slash1 = token.indexOf('/');
        let pi, ni;
        if (slash1 === -1) {
          pi = parseInt(token) - 1;
          ni = -1;
        } else {
          pi = parseInt(token.substring(0, slash1)) - 1;
          const slash2 = token.indexOf('/', slash1 + 1);
          if (slash2 === -1) {
            ni = -1;
          } else {
            const niStr = token.substring(slash2 + 1);
            ni = niStr === '' ? -1 : parseInt(niStr) - 1;
          }
        }

        const key = `${pi}/${ni}`;
        let idx = vertexMap.get(key);
        if (idx === undefined) {
          const vBase = pi * 3;
          idx = vertexData.length / 6;
          vertexData.push(rawPositions[vBase], rawPositions[vBase + 1], rawPositions[vBase + 2]);
          if (ni >= 0 && hasNormals) {
            const nBase = ni * 3;
            vertexData.push(rawNormals[nBase], rawNormals[nBase + 1], rawNormals[nBase + 2]);
          } else {
            vertexData.push(0, 0, 0);
          }
          vertexMap.set(key, idx);
        }
        faceVerts.push(idx);
      }

      // Fan triangulation
      for (let i = 1; i < faceVerts.length - 1; i++) {
        indices.push(faceVerts[0], faceVerts[i], faceVerts[i + 1]);
      }
    }
  }

  return {
    vertexData: new Float32Array(vertexData), // stride 6: [x,y,z,nx,ny,nz]
    indices: new Uint32Array(indices),
    vertexCount: vertexData.length / 6,
    hasNormals,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('Reading OBJ…');
  const text = readFileSync(INPUT, 'utf8');

  console.log('Parsing OBJ…');
  const { vertexData, indices, vertexCount, hasNormals } = parseOBJ(text);

  console.log(`  Vertices:   ${vertexCount}`);
  console.log(`  Triangles:  ${indices.length / 3}`);
  console.log(`  Normals:    ${hasNormals}`);

  await MeshoptClusterizer.ready;

  console.log('Building meshlets…');
  // Positions only needed for clustering; they're at offset 0 with stride 6
  const buffers = MeshoptClusterizer.buildMeshlets(
    indices,
    vertexData, // vertex_positions (positions at offset 0)
    6, // vertex_positions_stride (6 floats: xyz + nxnynz)
    MAX_VERTICES,
    MAX_TRIANGLES,
    CONE_WEIGHT,
  );

  console.log(`  Meshlets: ${buffers.meshletCount}`);

  console.log('Computing meshlet bounds…');
  const boundsRaw = MeshoptClusterizer.computeMeshletBounds(buffers, vertexData, 6);
  // computeMeshletBounds returns a single Bounds when meshletCount === 1, else Bounds[]
  const boundsArr = Array.isArray(boundsRaw) ? boundsRaw : [boundsRaw];

  // ---------------------------------------------------------------------------
  // Build output binary
  // ---------------------------------------------------------------------------
  const HEADER_BYTES = 32; // 8 × u32
  const FLAGS = hasNormals ? 1 : 0;

  const meshletVertexCount = buffers.vertices.length;
  const meshletTriangleBytes = buffers.triangles.length;
  const trianglePaddedBytes = (meshletTriangleBytes + 3) & ~3;

  const positionsBytes = vertexCount * 3 * 4;
  const normalsBytes = hasNormals ? vertexCount * 3 * 4 : 0;
  const meshletsBytes = buffers.meshletCount * 4 * 4;
  const meshletVerticesBytes = meshletVertexCount * 4;
  const boundsBytes = buffers.meshletCount * 11 * 4;

  const totalBytes =
    HEADER_BYTES +
    positionsBytes +
    normalsBytes +
    meshletsBytes +
    meshletVerticesBytes +
    trianglePaddedBytes +
    boundsBytes;

  const ab = new ArrayBuffer(totalBytes);
  const dv = new DataView(ab);
  let off = 0;

  // Header
  dv.setUint32(off, 0x4c54534d, true);
  off += 4; // magic "MSTL"
  dv.setUint32(off, 1, true);
  off += 4; // version
  dv.setUint32(off, vertexCount, true);
  off += 4;
  dv.setUint32(off, buffers.meshletCount, true);
  off += 4;
  dv.setUint32(off, meshletVertexCount, true);
  off += 4;
  dv.setUint32(off, meshletTriangleBytes, true);
  off += 4;
  dv.setUint32(off, FLAGS, true);
  off += 4;
  dv.setUint32(off, 0, true);
  off += 4; // reserved

  // Positions [x,y,z] per vertex — stride-3 slice of the interleaved buffer
  const posF32 = new Float32Array(ab, off, vertexCount * 3);
  for (let v = 0; v < vertexCount; v++) {
    posF32[v * 3 + 0] = vertexData[v * 6 + 0];
    posF32[v * 3 + 1] = vertexData[v * 6 + 1];
    posF32[v * 3 + 2] = vertexData[v * 6 + 2];
  }
  off += positionsBytes;

  // Normals [nx,ny,nz] per vertex
  if (hasNormals) {
    const normF32 = new Float32Array(ab, off, vertexCount * 3);
    for (let v = 0; v < vertexCount; v++) {
      normF32[v * 3 + 0] = vertexData[v * 6 + 3];
      normF32[v * 3 + 1] = vertexData[v * 6 + 4];
      normF32[v * 3 + 2] = vertexData[v * 6 + 5];
    }
    off += normalsBytes;
  }

  // Meshlets [vertex_offset, triangle_offset, vertex_count, triangle_count]
  new Uint32Array(ab, off, buffers.meshletCount * 4).set(
    buffers.meshlets.subarray(0, buffers.meshletCount * 4),
  );
  off += meshletsBytes;

  // Meshlet vertices
  new Uint32Array(ab, off, meshletVertexCount).set(buffers.vertices);
  off += meshletVerticesBytes;

  // Meshlet triangles (padded to 4 bytes)
  new Uint8Array(ab, off, meshletTriangleBytes).set(buffers.triangles);
  off += trianglePaddedBytes;

  // Bounds [cx,cy,cz,r, apexX,apexY,apexZ, axisX,axisY,axisZ, cutoff] per meshlet
  for (const b of boundsArr) {
    dv.setFloat32(off, b.centerX, true);
    off += 4;
    dv.setFloat32(off, b.centerY, true);
    off += 4;
    dv.setFloat32(off, b.centerZ, true);
    off += 4;
    dv.setFloat32(off, b.radius, true);
    off += 4;
    dv.setFloat32(off, b.coneApexX, true);
    off += 4;
    dv.setFloat32(off, b.coneApexY, true);
    off += 4;
    dv.setFloat32(off, b.coneApexZ, true);
    off += 4;
    dv.setFloat32(off, b.coneAxisX, true);
    off += 4;
    dv.setFloat32(off, b.coneAxisY, true);
    off += 4;
    dv.setFloat32(off, b.coneAxisZ, true);
    off += 4;
    dv.setFloat32(off, b.coneCutoff, true);
    off += 4;
  }

  console.log(`Writing ${(totalBytes / 1024 / 1024).toFixed(1)} MB to ${OUTPUT}…`);
  writeFileSync(OUTPUT, Buffer.from(ab));
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
