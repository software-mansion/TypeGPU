import * as d from 'typegpu/data';

import type { Drawer } from './surface.ts';

export const defaultDrawer: Drawer = {
  scalerX: { scale: (arr) => arr },
  scalerY: { scale: (arr) => arr },
  scalerZ: { scale: (arr) => arr },
  drawXZPlane: false,
  drawYZPlane: false,
  drawXYPlane: false,
  colorCallback: (y: number) => d.vec4f(d.vec3f(y), 1),
};
