import * as d from 'typegpu/data';

import { defaultDrawer } from '../presets.ts';
import type { Deformator, Drawer } from '../surface.ts';

const mountainsN = 49;
const mountainsM = 49;
const heightScale = 4;
export const mistyMountainsDeformator: Deformator = {
  n: mountainsN,
  m: mountainsM,
  xRange: [-1, 1],
  zRange: [-1, 1],
  yCallback: () => Math.random() * heightScale,
};

export const mistyMountainsDrawer: Drawer = {
  scalerX: defaultDrawer.scalerX,
  scalerY: defaultDrawer.scalerY,
  scalerZ: defaultDrawer.scalerZ,
  drawXZPlane: true,
  drawYZPlane: true,
  drawXYPlane: true,
  colorCallback: (y: number) => d.vec4f(d.vec3f(1 - y / heightScale), 1),
};
