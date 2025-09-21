import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';

import type { Transform, Vertex } from './structures.ts';

/**
 * @param n - number of rows
 * @param m - number of columns
 *
 * n, m must be greater than 1
 *
 * @param xRange - range of x values
 * @param zRange - range of z values
 * @param yCallback - callback to calculate y value
 */
export interface Deformator {
  n: number;
  m: number;
  xRange: [number, number];
  zRange: [number, number];
  yCallback: (x: number, z: number) => number;
}

/**
 * @param scale - function that scales an array
 */
export interface Scaler {
  scale: (arr: number[]) => number[];
}

export interface Drawer {
  scalerX: Scaler;
  scalerY: Scaler;
  scalerZ: Scaler;
  drawXZPlane: boolean;
  drawYZPlane: boolean;
  drawXYPlane: boolean;
  colorCallback: (y: number) => d.v4f;
}

/**
 * returns 1D array of vertices
 *    6 --- 7 --- 8
 *    |     |     |
 *    3 --- 4 --- 5
 *    |     |     |
 * -> 0 --- 1 --- 2
 */
export const createSurface = (
  deformator: Deformator,
  drawer: Drawer,
): d.Infer<typeof Vertex>[] => {
  const { n, m, xRange, zRange, yCallback } = deformator;
  const dz = (zRange[1] - zRange[0]) / (n - 1);
  const dx = (xRange[1] - xRange[0]) / (m - 1);

  const { scalerX, scalerY, scalerZ, colorCallback } = drawer;

  const zs = Array.from({ length: n }, (_, i) => zRange[0] + i * dz);
  const xs = Array.from({ length: m }, (_, j) => xRange[0] + j * dx);
  const zsScaled = scalerZ.scale(zs);
  const xsScaled = scalerX.scale(xs);

  const vertices = zs.flatMap((z, i) =>
    xs.map((x, j) => {
      const y = yCallback(x, z);
      return {
        position: d.vec4f(xsScaled[j], y, zsScaled[i], 1),
        color: colorCallback(y),
      };
    })
  );

  const ys = scalerY.scale(vertices.map((vertex) => vertex.position.y));

  vertices.forEach((vertex, index) => {
    vertex.position.y = ys[index];
  });

  return vertices;
};

/**
 * same as createSurface, just different arguments
 */
export const createSurfaceFromArrays = (
  xs: number[],
  ys: number[][],
  zs: number[],
  colorCallback: (y: number) => d.v4f,
): d.Infer<typeof Vertex>[] => {
  const n = zs.length;
  const m = xs.length;

  // const scaledZs = scaler1D(zs);
  // const scaledXs = scaler1D(xs);
  // const scaledYs = scaler1D(ys.flat());

  // const vertices = Array.from(
  //   { length: n },
  //   (_, i) =>
  //     Array.from({ length: m }, (_, j) => {
  //       const [z, x] = [scaledZs[i], scaledXs[j]];
  //       const y = scaledYs[i * m + j];
  //       return {
  //         position: d.vec4f(x, y, z, 1),
  //         color: colorCallback(y),
  //       };
  //     }),
  // ).flat();

  return [];
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
