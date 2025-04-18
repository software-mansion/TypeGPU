import * as d from 'typegpu/data';
import { normalize } from 'typegpu/std';

export const lightColor = d.vec3f(1.0, 1.0, 1.0);
export const lightPosition = d.vec3f(3.0, 3.0, 2.5);
export const lightDirection = normalize(d.vec3f(2.0, 1.0, 0.5));

export const cameraTarget = d.vec3f(0, 0, 0);
export const cameraInitialPos = d.vec4f(20, 5, 20, 1);
