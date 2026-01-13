/**
 * Line segment triangulation:
 *    0
 * 3/ | \2
 * |\ |\ |
 * | \| \|
 * 4\ | /5
 *    1
 *
 * Joins are added like: (only top shown)
 * 15---0---14
 *  |/ /|\ \|
 * 11 / | \ 10
 *  |/ /|\ \|
 *  7 / | \ 6
 *  |/  |  \|
 *  3   |   2
 */

// deno-fmt-ignore
const lineSegmentIndicesBase = [
  0, 5, 2,
  0, 3, 1,
  1, 3, 4,
  1, 5, 0,
];

// deno-fmt-ignore
const lineSegmentWireframeIndicesBase = [
  0, 1,
  0, 2,
  0, 3,
  0, 5,
  1, 3,
  1, 4,
  1, 5,
  2, 5,
  3, 4,
];

export function lineSegmentIndices(joinTriangleCount: number) {
  const indices = [...lineSegmentIndicesBase];
  for (let i = 0; i < joinTriangleCount; ++i) {
    for (let j = 0; j < 4; ++j) {
      const vertexIndex = i * 4 + j + 6;
      const end = j < 2 ? 0 : 1;
      const a = j % 2 === 0 ? end : vertexIndex - 4;
      const b = j % 2 === 0 ? vertexIndex - 4 : end;
      indices.push(vertexIndex, a, b);
    }
  }
  return indices;
}

export function lineSegmentWireframeIndices(joinTriangleCount: number) {
  const wireframeIndices = [...lineSegmentWireframeIndicesBase];
  for (let i = 0; i < joinTriangleCount; ++i) {
    for (let j = 0; j < 4; ++j) {
      const vertexIndex = i * 4 + j + 6;
      const end = j < 2 ? 0 : 1;
      const a = j % 2 === 0 ? end : vertexIndex - 4;
      const b = j % 2 === 0 ? vertexIndex - 4 : end;
      wireframeIndices.push(vertexIndex, a);
      wireframeIndices.push(vertexIndex, b);
    }
  }
  return wireframeIndices;
}

// deno-fmt-ignore
const lineSegmentLeftIndicesBase = [
  0, 3, 1,
  1, 3, 4,
];

export function lineSegmentLeftIndices(joinTriangleCount: number) {
  const indices = [...lineSegmentLeftIndicesBase];
  for (let i = 0; i < joinTriangleCount; ++i) {
    for (let j = 1; j < 3; ++j) {
      const vertexIndex = i * 4 + j + 6;
      const end = j < 2 ? 0 : 1;
      const a = j % 2 === 0 ? end : vertexIndex - 4;
      const b = j % 2 === 0 ? vertexIndex - 4 : end;
      indices.push(vertexIndex, a, b);
    }
  }
  return indices;
}
