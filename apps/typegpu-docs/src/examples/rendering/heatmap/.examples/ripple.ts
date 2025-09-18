import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

import type { Deformator, Drawer } from '../surface.ts';
import { defaultDrawer } from '../presets.ts';

const rippleN = 101;
const rippleM = 101;

export const rippleDeformator: Deformator = {
  n: rippleN,
  m: rippleM,
  xRange: [-1, 1],
  zRange: [-1, 1],
  yCallback: (x: number, z: number) => 1 + std.sin(10 * (x ** 2 + z ** 2)),
};

export const rippleDrawer: Drawer = {
  scalerX: defaultDrawer.scalerX,
  scalerY: defaultDrawer.scalerY,
  scalerZ: defaultDrawer.scalerZ,
  drawXZPlane: true,
  drawYZPlane: true,
  drawXYPlane: true,
  colorCallback: (y: number) => d.vec4f(d.vec3f(y / 2), 1),
};
