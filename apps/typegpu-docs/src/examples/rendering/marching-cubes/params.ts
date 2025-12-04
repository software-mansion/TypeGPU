import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const SIZE = 64;

export const cameraInitialPosition = d.vec4f(-10, 0, -10, 1);
export const cameraInitialTarget = d.vec4f(0, 0, 0, 1); // does not work...

export const lightColor = d.vec3f(0.9, 0.9, 0.8);
export const lightDirection = std.normalize(d.vec3f(-1.0, 4.0, -1.0));
export const backgroundColor = d.vec3f(0x00, 0x7a, 0xcc).div(255);
