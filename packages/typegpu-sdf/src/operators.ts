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
    return std.min(d1, d2) - h * h * k * (1 / 4);
  });

/**
 * Smooth difference operator for subtracting one SDF from another with a smooth transition
 *
 * @param d1 First SDF distance (base shape)
 * @param d2 Second SDF distance (shape to subtract)
 * @param k Smoothing factor (larger k = more smoothing)
 */
export const opSmoothDifference = tgpu
  .fn([d.f32, d.f32, d.f32], d.f32)((d1, d2, k) => {
    const h = std.max(k - std.abs(-d1 - d2), 0) / k;
    return std.max(-d2, d1) + h * h * k * (1 / 4);
  });

export const opExtrudeZ = tgpu.fn([d.vec3f, d.f32, d.f32], d.f32)(
  (p, dd, h) => {
    const w = d.vec2f(dd, std.abs(p.z) - h);
    return std.min(std.max(w.x, w.y), 0) + std.length(std.max(w, d.vec2f()));
  },
);

export const opExtrudeX = tgpu.fn([d.vec3f, d.f32, d.f32], d.f32)(
  (p, dd, h) => {
    const w = d.vec2f(dd, std.abs(p.x) - h);
    return std.min(std.max(w.x, w.y), 0) + std.length(std.max(w, d.vec2f()));
  },
);

export const opExtrudeY = tgpu.fn([d.vec3f, d.f32, d.f32], d.f32)(
  (p, dd, h) => {
    const w = d.vec2f(dd, std.abs(p.y) - h);
    return std.min(std.max(w.x, w.y), 0) + std.length(std.max(w, d.vec2f()));
  },
);

/**
 * Union operator for combining two SDFs
 * Returns the minimum distance between two SDFs
 */
export const opUnion = tgpu
  .fn([d.f32, d.f32], d.f32)((d1, d2) => std.min(d1, d2));
