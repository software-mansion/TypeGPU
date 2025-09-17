import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';

import type { Transform, Vertex } from './structures.ts';

const heightScale = 4;
const getHeight = (x: number, z: number): number => {
  return Math.random() * heightScale;
};
const getColor = (height: number): d.Infer<typeof Vertex>['color'] => {
  return d.vec4f(d.vec3f(1 - height / heightScale), 1);
};

export interface Deformator {
  n: number;
  m: number;
  xzCallback: (i: number, j: number) => [number, number];
  yCallback: (x: number, z: number) => number;
  colorCallback: (z: number) => d.v4f;
}

const mountainsN = 49;
const mountainsM = 49;
export const mistyMountains: Deformator = {
  n: mountainsN,
  m: mountainsM,
  xzCallback: (
    i,
    j,
  ) => [-1 + j * 2 / (mountainsM - 1), 1 - i * 2 / (mountainsN - 1)],
  yCallback: (x, z) => getHeight(x, z),
  colorCallback: (z) => getColor(z),
};

/**
 * n - number of rows
 * m - number of columns
 *
 * returns 1D array of vertices
 * -> 0 --- 1 --- 2
 *    |     |     |
 *    3 --- 4 --- 5
 *    |     |     |
 *    6 --- 7 --- 8
 *
 * 0 = (-1, 1)
 * 8 = (1, -1)
 *
 * clip space from -1 to 1
 */
export const createSurface = (deformator: Deformator) => {
  const { n, m, xzCallback, yCallback, colorCallback } = deformator;
  const vertices = Array.from(
    { length: n },
    (_, i) =>
      Array.from({ length: m }, (_, j) => {
        const [x, z] = xzCallback(i, j);
        const y = yCallback(x, z);
        return {
          position: d.vec4f(x, y, z, 1),
          color: colorCallback(y),
        };
      }),
  ).flat();
  return vertices;
};

export const getPlaneIndexArray = (
  n: number,
  m: number,
): number[] => {
  const indices = [];

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
