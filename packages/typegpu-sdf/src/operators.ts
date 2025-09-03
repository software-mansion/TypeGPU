import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

/**
 * Smooth minimum operator for combining two SDFs with a smooth transition
 *
 * Source: https://iquilezles.org/articles/smin/
 *
 * @param d1 First SDF distance
 * @param d2 Second SDF distance
 * @param k Smoothing factor (larger k = more smoothing)
 */
export const opSmoothUnion = tgpu
  .fn([d.f32, d.f32, d.f32], d.f32)((d1, d2, k) => {
    const h = std.max(k - std.abs(d1 - d2), 0) / k;
    return std.min(d1, d2) - h * h * k * (1 / d.f32(4));
  });

/**
 * Union operator for combining two SDFs
 * Returns the minimum distance between two SDFs
 */
export const opUnion = tgpu
  .fn([d.f32, d.f32], d.f32)((d1, d2) => std.min(d1, d2));
