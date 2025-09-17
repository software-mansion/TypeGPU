import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';
import * as std from 'typegpu/std';

import type { Transform, Vertex } from './structures.ts';

const heightScale = 4;

export interface Deformator {
  n: number;
  m: number;
  xzCallback: (i: number, j: number) => [number, number];
  yCallback: (x: number, z: number) => number;
  colorCallback: (y: number) => d.v4f;
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
  yCallback: () => Math.random() * heightScale,
  colorCallback: (y) => d.vec4f(d.vec3f(1 - y / heightScale), 1),
};

const rippleN = 101;
const rippleM = 101;
export const ripple: Deformator = {
  n: rippleN,
  m: rippleM,
  xzCallback: (
    i,
    j,
  ) => [-1 + j * 2 / (rippleM - 1), 1 - i * 2 / (rippleN - 1)],
  yCallback: (x, z) => 1 + std.sin(10 * (x ** 2 + z ** 2)),
  colorCallback: (y) => d.vec4f(d.vec3f(y / 2), 1),
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
 *
 * keep in mind that height is not scaled
 */
export const createSurface = (
  deformator: Deformator,
): d.Infer<typeof Vertex>[] => {
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

const scaler1D = (arr: number[]): number[] => {
  const min = arr.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
  const max = arr.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY);
  const range = max - min;
  return arr.map((e) => (2 * (e - min)) / (range + 1e-6) - 1);
};

const scaler2D = (arr: number[][]): number[][] => {
  const min = arr.flat().reduce(
    (a, b) => Math.min(a, b),
    Number.POSITIVE_INFINITY,
  );
  const max = arr.flat().reduce(
    (a, b) => Math.max(a, b),
    Number.NEGATIVE_INFINITY,
  );
  const range = max - min;
  return arr.map((row) => row.map((e) => (2 * (e - min)) / (range + 1e-6) - 1));
};

/**
 * arrays are scaled to fit the clip space [-1, 1]
 */
export const createSurfaceFromArrays = (
  xs: number[],
  ys: number[][],
  zs: number[],
  colorCallback: (y: number) => d.v4f,
): d.Infer<typeof Vertex>[] => {
  const n = zs.length;
  const m = xs.length;

  const scaledZs = scaler1D(zs);
  const scaledXs = scaler1D(xs);
  const scaledYs = scaler2D(ys);

  const vertices = Array.from(
    { length: n },
    (_, i) =>
      Array.from({ length: m }, (_, j) => {
        const [z, x] = [scaledZs[i], scaledXs[j]];
        const y = scaledYs[i][j];
        return {
          position: d.vec4f(x, y, z, 1),
          color: colorCallback(y),
        };
      }),
  ).flat();

  return vertices;
};

export const getSurfaceIndexArray = (
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

export const getSurfaceTransform = (
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
