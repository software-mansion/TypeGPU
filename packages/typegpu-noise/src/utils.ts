import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { pow } from 'typegpu/std';

/**
 * Works as a replacement for smoothstep, but with a continuous
 * second derivative, so lighting is continuous.
 */
export const smootherStep = tgpu['~unstable'].fn([d.f32], d.f32)((x) => {
  return 6 * pow(x, 5) - 15 * pow(x, 4) + 10 * pow(x, 3);
});
