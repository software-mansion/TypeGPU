import * as d from 'typegpu/data';

import * as c from './constants.ts';
import { GridSurface } from './grid.ts';

const mistyMountains = new GridSurface({
  nx: 49,
  nz: 49,
  xRange: { min: -5, max: 5 },
  zRange: { min: -5, max: 5 },
  yCallback: () => Math.random() * 4,
  colorCallback: (y: number) => d.vec4f(d.vec3f(y), 1),
});

const logXZ = new GridSurface({
  nx: 49,
  nz: 49,
  xRange: { min: -5, max: 5 },
  zRange: { min: -5, max: 5 },
  yCallback: (x: number, z: number) => Math.log(Math.abs(x * z) + c.EPS),
  colorCallback: (y: number) => d.vec4f(d.vec3f(y), 1),
});

const ripple = new GridSurface({
  nx: 101,
  nz: 101,
  xRange: { min: -1, max: 1 },
  zRange: { min: -1, max: 1 },
  yCallback: (x: number, z: number) => 1 + Math.sin(10 * (x ** 2 + z ** 2)),
  colorCallback: (y: number) => d.vec4f(d.vec3f(y / 3), 1),
});

const normal = new GridSurface({
  nx: 101,
  nz: 101,
  xRange: { min: -5, max: 5 },
  zRange: { min: -5, max: 5 },
  yCallback: (x: number, z: number) => Math.exp(-(x ** 2 + z ** 2) / 2),
  colorCallback: (y: number) => d.vec4f(d.vec3f(y), 1),
});

export const predefinedSurfaces = {
  mistyMountains,
  logXZ,
  ripple,
  normal,
};
