import tgpu, { type TgpuBuffer, type TgpuRoot, type VertexFlag } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { ComputeVertex, Vertex } from './dataTypes';

/**
 * Creates an icosphere with the specified level of subdivision
 * @param subdivisions Number of subdivisions to apply
 * @param useNormalizedNormals Whether to use normalized vertex normals (true) or face normals (false)
 * @returns Array of vertices defining the icosphere triangles
 */
export function createIcosphere(
  subdivisions: number,
  useNormalizedNormals = true,
): d.Infer<typeof Vertex>[] {
  // Golden ratio for icosahedron construction
  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  // Define initial icosahedron vertices
  const initialVertices: d.v4f[] = [
    // Top group
    d.vec4f(-1, goldenRatio, 0, 1),
    d.vec4f(1, goldenRatio, 0, 1),
    d.vec4f(-1, -goldenRatio, 0, 1),
    d.vec4f(1, -goldenRatio, 0, 1),

    // Middle group
    d.vec4f(0, -1, goldenRatio, 1),
    d.vec4f(0, 1, goldenRatio, 1),
    d.vec4f(0, -1, -goldenRatio, 1),
    d.vec4f(0, 1, -goldenRatio, 1),

    // Bottom group
    d.vec4f(goldenRatio, 0, -1, 1),
    d.vec4f(goldenRatio, 0, 1, 1),
    d.vec4f(-goldenRatio, 0, -1, 1),
    d.vec4f(-goldenRatio, 0, 1, 1),
  ].map((v) => {
    const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return d.vec4f(v.x / length, v.y / length, v.z / length, 1);
  });

  // Define the 20 triangular faces of the icosahedron using vertex indices
  const faces: [number, number, number][] = [
    // 5 faces around vertex 0
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    // 5 adjacent faces
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    // 5 faces around vertex 3
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    // 5 adjacent faces
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  // Container for the final vertex list
  const vertices: d.Infer<typeof Vertex>[] = [];

  // Create triangles of initial icosahedron
  const triangles: { v1: d.v4f; v2: d.v4f; v3: d.v4f; depth: number }[] = [];

  for (const [i1, i2, i3] of faces) {
    triangles.push({
      v1: initialVertices[i1],
      v2: initialVertices[i2],
      v3: initialVertices[i3],
      depth: subdivisions,
    });
  }

  while (triangles.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: <look at the line above>
    const triangle = triangles.pop()!;
    const { v1, v2, v3, depth } = triangle;

    if (depth === 0) {
      // Base case: add the triangle vertices
      if (useNormalizedNormals) {
        vertices.push(createVertex(v1, v1));
        vertices.push(createVertex(v2, v2));
        vertices.push(createVertex(v3, v3));
      } else {
        // Calculate face normal
        const edge1 = d.vec4f(v2.x - v1.x, v2.y - v1.y, v2.z - v1.z, 0);
        const edge2 = d.vec4f(v3.x - v1.x, v3.y - v1.y, v3.z - v1.z, 0);
        const faceNormal = normalizeSafely(
          d.vec4f(
            edge1.y * edge2.z - edge1.z * edge2.y,
            edge1.z * edge2.x - edge1.x * edge2.z,
            edge1.x * edge2.y - edge1.y * edge2.x,
            0,
          ),
        );
        vertices.push(createVertex(v1, faceNormal));
        vertices.push(createVertex(v2, faceNormal));
        vertices.push(createVertex(v3, faceNormal));
      }
    } else {
      // Calculate midpoints of each edge and project them onto the unit sphere
      const v12 = normalizeSafely(calculateMidpoint(v1, v2));
      const v23 = normalizeSafely(calculateMidpoint(v2, v3));
      const v31 = normalizeSafely(calculateMidpoint(v3, v1));

      // Add four new triangles to the stack (instead of recursive calls)
      triangles.push({ v1, v2: v12, v3: v31, depth: depth - 1 });
      triangles.push({ v1: v2, v2: v23, v3: v12, depth: depth - 1 });
      triangles.push({ v1: v3, v2: v31, v3: v23, depth: depth - 1 });
      triangles.push({ v1: v12, v2: v23, v3: v31, depth: depth - 1 });
    }
  }

  return vertices;
}

/**
 * Calculates the midpoint between two vertices
 */
function calculateMidpoint(v1: d.v4f, v2: d.v4f): d.v4f {
  return d.vec4f(
    (v1.x + v2.x) * 0.5,
    (v1.y + v2.y) * 0.5,
    (v1.z + v2.z) * 0.5,
    1,
  );
}

/**
 * Creates a vertex with position, color, and normal
 */
function createVertex(
  position: d.v4f,
  normal: d.v4f,
): ReturnType<typeof Vertex> {
  return Vertex({
    position,
    normal,
  });
}

/**
 * Safely normalizes a vector to prevent numerical instability
 */
function normalizeSafely(v: d.v4f): d.v4f {
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (length < 1e-8) {
    return d.vec4f(0, 0, 1, 1);
  }
  return d.vec4f(v.x / length, v.y / length, v.z / length, 1);
}

//////// GPU TERRITORY ////////

function getVertexAmount(subdivisions: number): number {
  return 60 * 4 ** subdivisions;
}

function createBaseIcosphere(smooth: boolean): d.Infer<typeof Vertex>[] {
  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  const initialVertices: d.v4f[] = [
    // Top group
    d.vec4f(-1, goldenRatio, 0, 1),
    d.vec4f(1, goldenRatio, 0, 1),
    d.vec4f(-1, -goldenRatio, 0, 1),
    d.vec4f(1, -goldenRatio, 0, 1),

    // Middle group
    d.vec4f(0, -1, goldenRatio, 1),
    d.vec4f(0, 1, goldenRatio, 1),
    d.vec4f(0, -1, -goldenRatio, 1),
    d.vec4f(0, 1, -goldenRatio, 1),

    // Bottom group
    d.vec4f(goldenRatio, 0, -1, 1),
    d.vec4f(goldenRatio, 0, 1, 1),
    d.vec4f(-goldenRatio, 0, -1, 1),
    d.vec4f(-goldenRatio, 0, 1, 1),
  ].map((v) => {
    const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return d.vec4f(v.x / length, v.y / length, v.z / length, 1);
  });

  // Define the 20 triangular faces of the icosahedron using vertex indices
  const faces: [number, number, number][] = [
    // 5 faces around vertex 0
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    // 5 adjacent faces
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    // 5 faces around vertex 3
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    // 5 adjacent faces
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  const vertices: d.Infer<typeof Vertex>[] = [];

  for (const [i1, i2, i3] of faces) {
    const v1 = initialVertices[i1];
    const v2 = initialVertices[i2];
    const v3 = initialVertices[i3];

    if (smooth) {
      vertices.push(createVertex(v1, v1));
      vertices.push(createVertex(v2, v2));
      vertices.push(createVertex(v3, v3));
    } else {
      const edge1 = d.vec4f(v2.x - v1.x, v2.y - v1.y, v2.z - v1.z, 0);
      const edge2 = d.vec4f(v3.x - v1.x, v3.y - v1.y, v3.z - v1.z, 0);
      const faceNormal = normalizeSafely(
        d.vec4f(
          edge1.y * edge2.z - edge1.z * edge2.y,
          edge1.z * edge2.x - edge1.x * edge2.z,
          edge1.x * edge2.y - edge1.y * edge2.x,
          0,
        ),
      );
      vertices.push(createVertex(v1, faceNormal));
      vertices.push(createVertex(v2, faceNormal));
      vertices.push(createVertex(v3, faceNormal));
    }
  }

  return vertices;
}

const icoshpereCache = new Map<
  string,
  TgpuBuffer<d.Disarray<typeof Vertex>> & VertexFlag
>();

export function createIcosphereShader(
  subdivisions: number,
  smooth: boolean,
  root: TgpuRoot,
): TgpuBuffer<d.Disarray<typeof Vertex>> & VertexFlag {
  const key = `${subdivisions}-${smooth}`;
  const cached = icoshpereCache.get(key);
  if (cached) {
    return cached;
  }

  const buffer = subdivide(subdivisions, smooth, root);
  icoshpereCache.set(key, buffer);
  return buffer;
}

function subdivide(
  wantedSubdivisions: number,
  smooth: boolean,
  root: TgpuRoot,
): TgpuBuffer<d.Disarray<typeof Vertex>> & VertexFlag {
  if (wantedSubdivisions === 0) {
    const key = `${wantedSubdivisions}-${smooth}`;
    const cached = icoshpereCache.get(key);
    if (cached) {
      return cached;
    }

    const initialVertices = root
      .createBuffer(
        d.disarrayOf(Vertex, getVertexAmount(0)),
        createBaseIcosphere(smooth),
      )
      .$usage('vertex')
      .$addFlags(GPUBufferUsage.STORAGE);
    icoshpereCache.set(key, initialVertices);
    return initialVertices;
  }

  const previousKey = `${wantedSubdivisions - 1}-${smooth}`;
  let previousVertices = icoshpereCache.get(previousKey);
  if (!previousVertices) {
    previousVertices = subdivide(wantedSubdivisions - 1, smooth, root);
  }

  const nextBuffer = root
    .createBuffer(d.disarrayOf(Vertex, getVertexAmount(wantedSubdivisions)))
    .$usage('vertex')
    .$addFlags(GPUBufferUsage.STORAGE);

  const currentComputeView = root
    .createBuffer(
      d.arrayOf(ComputeVertex, getVertexAmount(wantedSubdivisions - 1)),
      previousVertices.buffer,
    )
    .$usage('storage');
  const nextComputeView = root
    .createBuffer(
      d.arrayOf(ComputeVertex, getVertexAmount(wantedSubdivisions)),
      nextBuffer.buffer,
    )
    .$usage('storage');

  const smoothBuffer = root
    .createBuffer(d.u32, smooth ? 1 : 0)
    .$usage('uniform');

  const bindGroupLayout = tgpu.bindGroupLayout({
    prevVertices: {
      storage: (n: number) => d.arrayOf(ComputeVertex, n),
      access: 'readonly',
    },
    nextVertices: {
      storage: (n: number) => d.arrayOf(ComputeVertex, n),
      access: 'mutable',
    },
    smoothFlag: { uniform: d.u32 },
  });

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    prevVertices: currentComputeView,
    nextVertices: nextComputeView,
    smoothFlag: smoothBuffer,
  });

  const { prevVertices, nextVertices, smoothFlag } = bindGroupLayout.bound;

  const unpackVec2u = tgpu['~unstable'].fn([d.vec2u], d.vec4f).does((input) => {
    const xy = std.unpack2x16float(input.x);
    const zw = std.unpack2x16float(input.y);
    return d.vec4f(xy.x, xy.y, zw.x, zw.y);
  });

  const packVec2u = tgpu['~unstable'].fn([d.vec4f], d.vec2u).does((input) => {
    const xy = std.pack2x16float(d.vec2f(input.x, input.y));
    const zw = std.pack2x16float(d.vec2f(input.z, input.w));
    return d.vec2u(xy, zw);
  });

  const getNormal = tgpu['~unstable']
    .fn([d.vec4f, d.vec4f, d.vec4f, d.u32, d.vec4f], d.vec4f)
    .does((v1, v2, v3, smooth, vertexPos) => {
      if (smooth === 1) {
        // For smooth shading on a sphere, the normal is the same as the normalized position
        return vertexPos;
      }
      const edge1 = d.vec4f(v2.x - v1.x, v2.y - v1.y, v2.z - v1.z, 0);
      const edge2 = d.vec4f(v3.x - v1.x, v3.y - v1.y, v3.z - v1.z, 0);
      return std.normalize(
        d.vec4f(
          edge1.y * edge2.z - edge1.z * edge2.y,
          edge1.z * edge2.x - edge1.x * edge2.z,
          edge1.x * edge2.y - edge1.y * edge2.x,
          0,
        ),
      );
    });

  const calculateMidpoint = tgpu['~unstable']
    .fn([d.vec4f, d.vec4f], d.vec4f)
    .does((v1, v2) => {
      return d.vec4f(
        (v1.x + v2.x) * 0.5,
        (v1.y + v2.y) * 0.5,
        (v1.z + v2.z) * 0.5,
        1,
      );
    });

  const normalizeSafely = tgpu['~unstable'].fn([d.vec4f], d.vec4f).does((v) => {
    const length = std.length(d.vec3f(v.x, v.y, v.z));
    const epsilon = 1e-8;
    if (length < epsilon) {
      return d.vec4f(0, 0, 1, 1);
    }
    return d.vec4f(v.x / length, v.y / length, v.z / length, 1);
  });

  const computeFn = tgpu['~unstable']
    .computeFn({
      in: { gid: d.builtin.globalInvocationId },
      workgroupSize: [64, 1, 1],
    })
    .does((input) => {
      const triangleCount = std.arrayLength(prevVertices.value) / d.u32(3);
      // Calculate global triangleIndex from 2D dispatch
      const triangleIndex = input.gid.x + input.gid.y * d.u32(65535);
      if (triangleIndex >= triangleCount) {
        return;
      }

      const baseIndexPrev = triangleIndex * d.u32(3);

      // Read the 3 vertices of the triangle
      const v1 = unpackVec2u(prevVertices.value[baseIndexPrev].position);
      const v2 = unpackVec2u(
        prevVertices.value[baseIndexPrev + d.u32(1)].position,
      );
      const v3 = unpackVec2u(
        prevVertices.value[baseIndexPrev + d.u32(2)].position,
      );

      // Calculate the midpoints of the edges and reproject them onto the unit sphere
      const v12 = normalizeSafely(calculateMidpoint(v1, v2));
      const v23 = normalizeSafely(calculateMidpoint(v2, v3));
      const v31 = normalizeSafely(calculateMidpoint(v3, v1));

      const newVertices = [
        // Triangle A: [v1, v12, v31]
        v1,
        v12,
        v31,
        // Triangle B: [v2, v23, v12]
        v2,
        v23,
        v12,
        // Triangle C: [v3, v31, v23]
        v3,
        v31,
        v23,
        // Triangle D: [v12, v23, v31]
        v12,
        v23,
        v31,
      ];

      const baseIndexNext = triangleIndex * d.u32(12);
      // For each of the 12 new vertices, compute and store their values.
      for (let i = d.u32(0); i < 12; i++) {
        const reprojectedVertex = newVertices[i];

        const triBase = i - (i % d.u32(3));
        const normal = getNormal(
          newVertices[triBase],
          newVertices[triBase + d.u32(1)],
          newVertices[triBase + d.u32(2)],
          smoothFlag.value,
          reprojectedVertex,
        );
        const outIndex = baseIndexNext + i;
        const nextVertex = nextVertices.value[outIndex];
        nextVertex.position = packVec2u(reprojectedVertex);
        nextVertex.normal = packVec2u(normal);
        nextVertices.value[outIndex] = nextVertex;
      }
    });

  const pipeline = root['~unstable'].withCompute(computeFn).createPipeline();

  // Calculate the appropriate workgroup dispatch dimensions, splitting across X and Y
  // when needed to stay within the 65535 limit
  const triangleCount = getVertexAmount(wantedSubdivisions - 1) / 3;
  const xGroups = Math.min(triangleCount, 65535);
  const yGroups = Math.ceil(triangleCount / 65535);

  pipeline
    .with(bindGroupLayout, bindGroup)
    .dispatchWorkgroups(xGroups, yGroups, 1);

  root['~unstable'].flush();

  return nextBuffer;
}
