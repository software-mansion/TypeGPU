import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';

import type { Transform, Vertex } from './structures.ts';

const heightScale = 4;
const getColor = (height: number): d.Infer<typeof Vertex>['color'] => {
  return d.vec4f(d.vec3f(1 - height / heightScale), 1);
};

export const createPlane = (n: number, m: number): d.Infer<typeof Vertex>[] => {
  const nSideLength = 2;
  const mSideLength = 2;
  const nSubdivisionLength = nSideLength / (n - 1);
  const mSubdivisionLength = mSideLength / (m - 1);

  const indices = Array.from(
    { length: n },
    (_, i) => Array.from({ length: m }, (_, j) => [i, j] as [number, number]),
  );
  const coords = indices.map((ar) =>
    ar.map((e) => {
      const [i, j] = e;
      return [-1 + j * mSubdivisionLength, 1 - i * nSubdivisionLength];
    })
  );
  const heights = Array.from(
    { length: n * m },
    () => heightScale * Math.random(),
  );
  const vertices = coords.flat().map((e, i) => ({
    position: d.vec4f(e[0], heights[i], e[1], 1),
    color: getColor(heights[i]),
  }));

  return vertices;
};

export const getPlaneIndexArray = (
  n: number,
  m: number,
): number[] => {
  const indices: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const topLeft = i * m + j;
      const topRight = i * m + (j + 1);
      const bottomLeft = (i + 1) * m + j;
      const bottomRight = (i + 1) * m + (j + 1);

      indices.push(topLeft, bottomLeft, bottomRight);
      indices.push(topLeft, bottomRight, topRight);
    }
  }

  return indices;
};

export const getPlaneTransform = (
  translation: d.v3f,
  scale: d.v3f,
): d.Infer<typeof Transform> => {
  return {
    model: m.mat4.scale(
      m.mat4.translate(m.mat4.identity(d.mat4x4f()), translation, d.mat4x4f()),
      scale,
      d.mat4x4f(),
    ),
  };
};
