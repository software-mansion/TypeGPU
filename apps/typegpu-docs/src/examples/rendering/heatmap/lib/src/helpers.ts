import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';

import type * as s from './structures.ts';
import type { GridConfig } from './types.ts';

export function createTransformMatrix(
  translation: d.v3f,
  scale: d.v3f,
): d.Infer<typeof s.Transform> {
  return {
    model: m.mat4.scale(
      m.mat4.translate(m.mat4.identity(d.mat4x4f()), translation, d.mat4x4f()),
      scale,
      d.mat4x4f(),
    ),
  };
}

/**
 * returns 1D array of vertices
 *    6 --- 7 --- 8
 *    |     |     |
 *    3 --- 4 --- 5
 *    |     |     |
 * -> 0 --- 1 --- 2
 *
 * with x,z coordinates filled
 */
export function createGrid(gridConfig: GridConfig): d.Infer<typeof s.Vertex>[] {
  const { nx, nz, xRange, zRange } = gridConfig;
  const dz = (zRange.max - zRange.min) / (nz - 1);
  const dx = (xRange.max - xRange.min) / (nx - 1);

  const zs = Array.from({ length: nx }, (_, i) => zRange.min + i * dz);
  const xs = Array.from({ length: nz }, (_, j) => xRange.min + j * dx);

  const vertices = zs.flatMap((z) =>
    xs.map((x) => ({
      position: d.vec4f(x, 0, z, 1),
      color: d.vec4f(0),
    }))
  );

  return vertices;
}

export function createGridIndexArray(nx: number, nz: number): number[] {
  const indices = [];

  for (let i = 0; i < nz - 1; i++) {
    for (let j = 0; j < nx - 1; j++) {
      const topLeft = i * nx + j;
      const topRight = i * nx + (j + 1);
      const bottomLeft = (i + 1) * nx + j;
      const bottomRight = (i + 1) * nx + (j + 1);

      indices.push(topLeft, bottomLeft, bottomRight);
      indices.push(topLeft, bottomRight, topRight);
    }
  }

  return indices;
}
