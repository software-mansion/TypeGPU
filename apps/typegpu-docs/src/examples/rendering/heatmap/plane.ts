import * as d from 'typegpu/data';

import { defaultDrawer } from './presets.ts';
import type { Deformator, Drawer } from './surface.ts';

const mountainsN = 2;
const mountainsM = 2;
export const planeDeformator: Deformator = {
  n: mountainsN,
  m: mountainsM,
  xRange: [-1, 1],
  zRange: [-1, 1],
  yCallback: () => 0,
};

export const planeDrawer: Drawer = {
  scalerX: defaultDrawer.scalerX,
  scalerY: defaultDrawer.scalerY,
  scalerZ: defaultDrawer.scalerZ,
  drawXZPlane: false,
  drawYZPlane: false,
  drawXYPlane: false,
  colorCallback: (_) => d.vec4f(d.vec3f(0.29, 0.21, 0.47), 0.5),
};
