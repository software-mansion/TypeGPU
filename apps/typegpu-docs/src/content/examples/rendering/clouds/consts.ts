import * as d from 'typegpu/data';
import tgpu, { type TgpuFn } from 'typegpu';

export const MAX_ITERATIONS = 120; // 50 - 200
export const MARCH_SIZE = 0.05; // 0.05 - 0.15
export const SUN_DIRECTION = d.vec3f(1.0, 0.0, 0.0); // [-1.0, -1.0, -1.0] - [1.0, 1.0, 1.0]
export const ANGLE_DISTORTION = 1.0; // 0.1 - 3.0
export const SUN_INTENSITY = 0.7; // 0.01 - 1.0
export const LIGHT_ABSORBTION = 0.88; // 0.0 - 1.0
export const CLOUD_DENSITY = 0.6; // 0.0 - 1.0
export const CLOUD_CORE_DENSITY = 1.0; //0.0 - 10.0
export const FLIGHT_SPEED = 3.0; // 1.0 - 10.0
export const CLOUD_DETALIZATION = 2.23; // 0.0 - 4.0

export const raymarchSlot = tgpu.slot<TgpuFn>();
export const timeAccess = tgpu['~unstable'].accessor(d.f32);
export const resolutionAccess = tgpu['~unstable'].accessor(d.vec2f);
