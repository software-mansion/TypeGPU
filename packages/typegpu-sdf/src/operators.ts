import tgpu from 'typegpu';
import { f32 } from 'typegpu/data';
import { min } from 'typegpu/std';

/**
 * Union operator for combining two SDFs
 * Returns the minimum distance between two SDFs
 */
// TODO: Mark this function for inlining, when that's possible
export const opUnion = tgpu['~unstable'].fn([f32, f32], f32)((d1, d2) =>
  min(d1, d2)
);
