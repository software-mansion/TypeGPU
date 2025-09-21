import * as d from 'typegpu/data';

import type { Deformator, Drawer } from '../surface.ts';
import { minmaxScaler } from '../scalers.ts';
import { defaultDrawer } from '../presets.ts';

const normalN = 101;
const normalM = 101;

export const normalDeformator: Deformator = {
  n: normalN,
  m: normalM,
  xRange: [-5, 5],
  zRange: [-5, 5],
  yCallback: (x: number, z: number) => Math.exp(-(x ** 2 + z ** 2) / 2),
};

export const normalDrawer: Drawer = {
  scalerX: minmaxScaler,
  scalerY: defaultDrawer.scalerY,
  scalerZ: minmaxScaler,
  drawXZPlane: true,
  drawYZPlane: true,
  drawXYPlane: true,
  colorCallback: (y: number) => d.vec4f(d.vec3f(y), 1),
};
