import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const cameraInitialPosition = d.vec4f(-5.2, 0, -5.2, 1);
export const cameraInitialTarget = d.vec4f(0, 0, 0, 1);

export const lightColor = d.vec3f(0.9, 0.9, 0.8);
export const lightDirection = std.normalize(d.vec3f(-1.0, 4.0, -1.0));
export const backgroundColor = d.vec3f(0x00, 0x7a, 0xcc).div(255);
