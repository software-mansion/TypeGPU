import * as d from 'typegpu/data';

const MAX_STEPS = 1000;
const MAX_DIST = 19;
const SURF_DIST = 0.001;
const GRID_SEP = 1.2;
const GRID_TIGHTNESS = 7;
const CIRCLE_FLOOR_MASS = 5;

const skyColor1 = d.vec4f(0.1, 0, 0.2, 1);
const skyColor2 = d.vec4f(0.28, 0, 0.54, 1);
const gridColor = d.vec3f(0.92, 0.21, 0.96);
const gridInnerColor = d.vec3f(0, 0, 0);
const sphereCenter = d.vec3f(0, 6, 12);

export {
  CIRCLE_FLOOR_MASS,
  GRID_SEP,
  GRID_TIGHTNESS,
  gridColor,
  gridInnerColor,
  MAX_DIST,
  MAX_STEPS,
  skyColor1,
  skyColor2,
  sphereCenter,
  SURF_DIST,
};
