import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const workGroupSize = 256;

export const fishAmount = 1024 * 8;
export const fishModelScale = 0.07;

export const fishSeparationDistance = 0.3;
export const fishSeparationStrength = 0.0006;
export const fishAlignmentDistance = 0.3;
export const fishAlignmentStrength = 0.005;
export const fishCohesionDistance = 0.5;
export const fishCohesionStrength = 0.0008;
export const fishWallRepulsionDistance = 0.1;
export const fishWallRepulsionStrength = 0.0001;
export const fishMouseRayRepulsionDistance = 0.9;
export const fishMouseRayRepulsionStrength = 0.0005;

export const aquariumSize = d.vec3f(10, 4, 10);

export const cameraInitialPosition = d.vec4f(-5.2, 0, -5.2, 1);
export const cameraInitialTarget = d.vec4f(0, 0, 0, 1);

export const lightColor = d.vec3f(0.8, 0.8, 1);
export const lightDirection = std.normalize(d.vec3f(-1.0, 4.0, -1.0));
export const backgroundColor = std.mul(1 / 255, d.vec3f(0x00, 0x7a, 0xcc));
