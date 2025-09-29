import * as d from 'typegpu/data';

import { GridSurface } from './utils.ts';

const heightScale = 4;
const mistyMountains = new GridSurface({
  nx: 49,
  nz: 49,
  xRange: { min: -1, max: 1 },
  zRange: { min: -1, max: 1 },
  yCallback: () => Math.random() * 4,
  colorCallback: (y: number) => d.vec4f(d.vec3f(y).div(heightScale), 1),
});

export const predefinedSurfaces = {
  mistyMountains,
};
