import { d, std, tgpu } from 'typegpu';
import { type IndexedGeometry, Surface } from './geometry.ts';

const QUAD = tgpu.const(d.arrayOf(d.vec2u, 6), [
  d.vec2u(0, 0),
  d.vec2u(1, 0),
  d.vec2u(1, 1),
  d.vec2u(0, 0),
  d.vec2u(1, 1),
  d.vec2u(0, 1),
]);

const EPS = 1e-3;

export interface Parametric {
  at(this: void, u: number, v: number): d.v3f;
  normalAt?(this: void, u: number, v: number): d.v3f;
}

export interface ParametricOptions {
  cols: number;
  rows: number;
}

export function parametric(
  surface: Parametric,
  { cols, rows }: ParametricOptions,
): IndexedGeometry {
  const at = surface.at;
  const normalAt =
    surface.normalAt ??
    ((u: number, v: number) => {
      'use gpu';
      const vv = std.clamp(v, 2 * EPS, 1 - 2 * EPS);
      const du = at(std.min(u + EPS, 1), vv) - at(std.max(u - EPS, 0), vv);
      const dv = at(u, vv + EPS) - at(u, vv - EPS);
      const normal = std.cross(du, dv);
      if (std.dot(normal, normal) > 0) {
        return std.normalize(normal);
      }

      return d.vec3f();
    });

  return sampleGrid(
    (u, v) => {
      'use gpu';
      return Surface({ position: at(u, v), normal: normalAt(u, v), uv: d.vec2f(u, v) });
    },
    { cols, rows },
  );
}

export function sampleGrid(
  sample: (u: number, v: number) => d.Infer<typeof Surface>,
  { cols, rows }: ParametricOptions,
): IndexedGeometry {
  if (!Number.isSafeInteger(cols) || cols < 1 || !Number.isSafeInteger(rows) || rows < 1) {
    throw new Error('parametric needs positive integer cols and rows');
  }

  return {
    schema: Surface,
    topology: 'triangle-list',
    vertexCount: (cols + 1) * (rows + 1),
    indexCount: cols * rows * 6,

    vertexAt: (i: number) => {
      'use gpu';
      const col = i % (cols + 1);
      const row = std.intdiv(i, cols + 1);
      const u = col / cols;
      const v = row / rows;

      return sample(u, v);
    },

    indexAt: (i: number) => {
      'use gpu';
      const cell = std.intdiv(i, 6);
      const corner = QUAD.$[i % 6] as d.v2u;
      const col = (cell % cols) + corner.x;
      const row = std.intdiv(cell, cols) + corner.y;

      return row * (cols + 1) + col;
    },
  };
}
