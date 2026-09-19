import { d, std } from 'typegpu';
import { type IndexedGeometry, type Surface } from './geometry.ts';

export interface PatchSurface<V extends d.AnyWgslData = typeof Surface> {
  readonly schema: V;
  readonly patchCount: number;
  at(this: void, patch: number, weights: d.v3f): d.InferGPU<V>;
}

function checkSegments(segments: number) {
  if (!Number.isSafeInteger(segments) || segments < 1 || segments > 32767) {
    throw new Error('tessellation needs an integer segment count between 1 and 32767');
  }
}

export function triangleVertexCount(segments: number) {
  checkSegments(segments);
  return ((segments + 1) * (segments + 2)) / 2;
}

export function triangleIndexCount(segments: number) {
  checkSegments(segments);
  return 3 * segments * segments;
}

export function triangleBarycentrics(vertex: number, segments: number) {
  'use gpu';
  let row = d.u32((std.sqrt(8 * d.f32(vertex) + 1) - 1) / 2);
  if (std.intdiv(row * (row + 1), 2) > vertex) row -= 1;
  else if (std.intdiv((row + 1) * (row + 2), 2) <= vertex) row += 1;
  const start = std.intdiv(row * (row + 1), 2);
  const col = vertex - start;
  return d.vec3f(1 - row / segments, (row - col) / segments, col / segments);
}

export function triangleIndexAt(index: number) {
  'use gpu';
  const triangle = std.intdiv(index, 3);
  let row = d.u32(std.sqrt(d.f32(triangle)));
  if (row * row > triangle) row -= 1;
  else if ((row + 1) * (row + 1) <= triangle) row += 1;
  const col = triangle - row * row;
  const start = std.intdiv(row * (row + 1), 2);
  const corner = index % 3;
  if (col <= row) {
    if (corner === 0) return start + col;
    return start + col + row + corner;
  }
  const vertex = start + col - row - 1;
  if (corner === 0) return vertex;
  if (corner === 1) return vertex + row + 2;
  return vertex + 1;
}

/** Lower subdivision levels use a prefix of these indices */
export function triangleIndices(maxSegments: number) {
  checkSegments(maxSegments);
  return Array.from({ length: triangleIndexCount(maxSegments) }, (_, i) => triangleIndexAt(i));
}

export function tessellate<V extends d.AnyWgslData>(
  patches: PatchSurface<V>,
  segments: number,
): IndexedGeometry<V> {
  checkSegments(segments);
  const vertices = triangleVertexCount(segments);
  const indices = triangleIndexCount(segments);
  if (
    !Number.isSafeInteger(patches.patchCount) ||
    patches.patchCount < 1 ||
    patches.patchCount * vertices > 0xffffffff ||
    patches.patchCount * indices > 0xffffffff
  ) {
    throw new Error('tessellate needs a positive patch count and counts that fit in u32');
  }
  return {
    schema: patches.schema,
    topology: 'triangle-list',
    vertexCount: patches.patchCount * vertices,
    indexCount: patches.patchCount * indices,
    vertexAt: (i: number) => {
      'use gpu';
      return patches.at(std.intdiv(i, vertices), triangleBarycentrics(i % vertices, segments));
    },
    indexAt: (i: number) => {
      'use gpu';
      return std.intdiv(i, indices) * vertices + triangleIndexAt(i % indices);
    },
  };
}
