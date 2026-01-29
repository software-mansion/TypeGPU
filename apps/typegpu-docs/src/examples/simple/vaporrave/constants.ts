import { d } from 'typegpu';

export const MAX_STEPS = 1000;
export const MAX_DIST = 19;
export const SURF_DIST = 0.001;
export const GRID_SEP = 1.2;
export const GRID_TIGHTNESS = 7;
export const CIRCLE_FLOOR_MASS = 5;
export const PERIOD = 7;
export const NUM_CYCLES = 5000;
export const PLANE_OFFSET = 1;
export const SPHERE_RADIUS = 3;
export const INITIAL_GLOW_INTENSITY = 0.14;

export const skyColor1 = d.vec4f(0.1, 0, 0.2, 1);
export const skyColor2 = d.vec4f(0.28, 0, 0.54, 1);
export const gridColor = d.vec3f(0.92, 0.21, 0.96);
export const gridInnerColor = d.vec3f();
export const sphereCenter = d.vec3f(0, 6, 12);
export const initialSphereColor = d.vec3f(0, 0.25, 1);
export const planeOrthonormal = d.vec3f(0, 1, 0);
