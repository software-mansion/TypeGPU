import { d, std, tgpu } from 'typegpu';
import { Surface } from '../geometry.ts';
import { type PatchSurface } from '../triangles.ts';
import { uniformArea } from './spherical.ts';

const phi = (1 + Math.sqrt(5)) / 2;
const corners = (
  [
    [-1, phi, 0],
    [1, phi, 0],
    [-1, -phi, 0],
    [1, -phi, 0],
    [0, -1, phi],
    [0, 1, phi],
    [0, -1, -phi],
    [0, 1, -phi],
    [phi, 0, -1],
    [phi, 0, 1],
    [-phi, 0, -1],
    [-phi, 0, 1],
  ] as const
).map(([x, y, z]) => std.normalize(d.vec3f(x, y, z)));
const faces = [
  0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
  3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
];
const vertices = tgpu.const(
  d.arrayOf(d.vec3f, faces.length),
  faces.map((i) => corners[i] as d.v3f),
);

export interface IcosphereOptions {
  radius?: number;
  interpolate?: typeof uniformArea;
}

/** UVs are local barycentric coordinates within each patch */
export function icosphere({
  radius = 0.5,
  interpolate = uniformArea,
}: IcosphereOptions = {}): PatchSurface {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error('icosphere needs a positive finite radius');
  }
  return {
    schema: Surface,
    patchCount: 20,
    at: (patch: number, w: d.v3f) => {
      'use gpu';
      const offset = patch * 3;
      const a = vertices.$[offset] as d.v3f;
      const b = vertices.$[offset + 1] as d.v3f;
      const c = vertices.$[offset + 2] as d.v3f;
      const normal = interpolate(a, b, c, w);
      return Surface({ position: normal * radius, normal, uv: w.yz });
    },
  };
}
