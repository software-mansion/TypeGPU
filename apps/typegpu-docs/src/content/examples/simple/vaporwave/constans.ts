import * as d from "typegpu/data";

const MAX_STEPS = 1000;
const MAX_DIST = 19;
const SURF_DIST = 0.001;
const GRID_SEP = 1.2;
const GRID_TIGHTNESS = 7;

const skyColor = d.vec4f(0.1, 0, 0.2, 1);
const gridColor = d.vec3f(0.92, 0.21, 0.96);
const gridInnerColor = d.vec3f(0, 0, 0);
const ballCenter = d.vec3f(0, 6, 12);

export {
  MAX_STEPS,
  MAX_DIST,
  SURF_DIST,
  GRID_SEP,
  GRID_TIGHTNESS,
  skyColor,
  gridColor,
  gridInnerColor,
  ballCenter,
};
