import * as d from 'typegpu/data';

export const target = d.vec3f(0, 0, 0);
export const cameraInitialPos = d.vec4f(14, 7, 14, 1);
export const EPS = 1e-6;
// these two variables below are intentionally separate
export const surfaceTranslation = d.vec3f(0, -3, 0);
export const planeTranslation = d.vec3f(0, -2, 0);
export const surfaceScale = d.vec3f(5, 1, 5);
export const planeScale = d.vec3f(5.5, 1, 5.5);
