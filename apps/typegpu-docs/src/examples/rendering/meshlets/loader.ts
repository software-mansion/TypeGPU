import { BufferReader, object, u32 } from 'typed-binary';
import { parse } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';

const MAGIC = 0x4c54534d;
const HEADER_BYTES = 32;

const FileHeader = object({
  magic: u32,
  version: u32,
  vertexCount: u32,
  meshletCount: u32,
  meshletVertexCount: u32,
  meshletTriangleBytes: u32,
  flags: u32,
  _reserved: u32,
});

export interface MeshletData {
  vertexCount: number;
  meshletCount: number;
  meshletVertexCount: number;
  meshletTriangleBytes: number;
  hasNormals: boolean;
  positions: Float32Array; // vertex_count × 3 floats
  normals: Float32Array; // vertex_count × 3 floats (may be all-zero if !hasNormals)
  meshlets: Uint32Array; // meshlet_count × 4 u32: [vertexOffset, triangleOffset, vertexCount, triangleCount]
  meshletVertices: Uint32Array; // meshlet_vertex_count u32
  meshletTriangles: Uint8Array; // meshlet_triangle_bytes u8 (padded to 4-byte boundary)
  bounds: Float32Array; // meshlet_count × 11 floats
}

export async function loadMeshlets(url: string): Promise<MeshletData> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch meshlet file: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();

  const header = FileHeader.read(new BufferReader(buffer));
  if (header.magic !== MAGIC) {
    throw new Error(`Invalid meshlet file magic: 0x${header.magic.toString(16)}`);
  }

  const { vertexCount, meshletCount, meshletVertexCount, meshletTriangleBytes, flags } = header;
  const hasNormals = (flags & 1) !== 0;

  const trianglePaddedBytes = (meshletTriangleBytes + 3) & ~3;

  let off = HEADER_BYTES;

  const positions = new Float32Array(buffer, off, vertexCount * 3);
  off += vertexCount * 3 * 4;

  let normals: Float32Array;
  if (hasNormals) {
    normals = new Float32Array(buffer, off, vertexCount * 3);
    off += vertexCount * 3 * 4;
  } else {
    normals = new Float32Array(vertexCount * 3);
  }

  const meshlets = new Uint32Array(buffer, off, meshletCount * 4);
  off += meshletCount * 4 * 4;

  const meshletVertices = new Uint32Array(buffer, off, meshletVertexCount);
  off += meshletVertexCount * 4;

  const meshletTriangles = new Uint8Array(buffer, off, meshletTriangleBytes);
  off += trianglePaddedBytes;

  const bounds = new Float32Array(buffer, off, meshletCount * 11);

  return {
    vertexCount,
    meshletCount,
    meshletVertexCount,
    meshletTriangleBytes,
    hasNormals,
    positions,
    normals,
    meshlets,
    meshletVertices,
    meshletTriangles,
    bounds,
  };
}

export interface ObjData {
  /** Interleaved: [px,py,pz,1, nx,ny,nz,0] × vertexCount (8 floats/vertex = 32 bytes) */
  vertices: Float32Array<ArrayBuffer>;
  vertexCount: number;
}

export async function loadObj(url: string): Promise<ObjData> {
  const text = await fetch(url).then((r) => r.text());

  // Parse geometry via loaders.gl (handles UV seams, fan triangulation, etc.)
  const mesh = await parse(text, OBJLoader);
  const pos = mesh.attributes['POSITION'].value as Float32Array;
  const nrm =
    (mesh.attributes['NORMAL']?.value as Float32Array | undefined) ?? new Float32Array(pos.length);
  const vertexCount = pos.length / 3;

  // Interleave into 32-byte vertex layout: [px,py,pz,1, nx,ny,nz,0]
  const vertices = new Float32Array(vertexCount * 8);
  for (let i = 0; i < vertexCount; i++) {
    const b = i * 8;
    vertices[b] = pos[i * 3];
    vertices[b + 1] = pos[i * 3 + 1];
    vertices[b + 2] = pos[i * 3 + 2];
    vertices[b + 3] = 1;
    vertices[b + 4] = nrm[i * 3];
    vertices[b + 5] = nrm[i * 3 + 1];
    vertices[b + 6] = nrm[i * 3 + 2];
    vertices[b + 7] = 0;
  }

  return { vertices, vertexCount };
}
