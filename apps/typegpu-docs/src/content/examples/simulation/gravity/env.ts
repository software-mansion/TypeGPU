import { normalize } from 'typegpu/std';
import * as d from 'typegpu/data';

export const lightPosition = d.vec3f(3.0, 3.0, 2.5);
export const lightDirection = normalize(d.vec3f(2.0, 1.0, 0.5));

export const target = d.vec3f(0, 0, 0);
export const cameraInitialPos = d.vec4f(5, 2, 5, 1);

