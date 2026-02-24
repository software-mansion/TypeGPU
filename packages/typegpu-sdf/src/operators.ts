import tgpu, { d, std } from 'typegpu';

/**
 * Union operator for combining two SDFs
 * Returns the minimum distance between two SDFs
 *
 * @param d1 First SDF distance
 * @param d2 Second SDF distance
 */
export const opUnion = tgpu
  .fn([d.f32, d.f32], d.f32)((d1, d2) => std.min(d1, d2));

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
    const h = std.max(k - std.abs(d1 + d2), 0) / k;
    return std.max(-d2, d1) + h * h * k * (1 / 4);
  });

/**
 * Extrudes a 2D signed distance function along the Z-axis to create a 3D shape.
 *
 * @param point The 3D point to evaluate the distance at
 * @param dd The 2D signed distance field value (distance in XY plane)
 * @param halfHeight Half-height of the extrusion along the Z-axis
 */
export const opExtrudeZ = tgpu.fn([d.vec3f, d.f32, d.f32], d.f32)(
  (point, dd, halfHeight) => {
    const w = d.vec2f(dd, std.abs(point.z) - halfHeight);
    return std.min(std.max(w.x, w.y), 0) + std.length(std.max(w, d.vec2f()));
  },
);

/**
 * Extrudes a 2D signed distance function along the X-axis to create a 3D shape.
 *
 * @param point The 3D point to evaluate the distance at
 * @param dd The 2D signed distance field value (distance in YZ plane)
 * @param halfHeight Half-height of the extrusion along the X-axis
 */
export const opExtrudeX = tgpu.fn([d.vec3f, d.f32, d.f32], d.f32)(
  (point, dd, halfHeight) => {
    const w = d.vec2f(dd, std.abs(point.x) - halfHeight);
    return std.min(std.max(w.x, w.y), 0) + std.length(std.max(w, d.vec2f()));
  },
);

/**
 * Extrudes a 2D signed distance function along the Y-axis to create a 3D shape.
 *
 * @param point The 3D point to evaluate the distance at
 * @param dd The 2D signed distance field value (distance in ZX plane)
 * @param halfHeight Half-height of the extrusion along the Y-axis
 */
export const opExtrudeY = tgpu.fn([d.vec3f, d.f32, d.f32], d.f32)(
  (point, dd, halfHeight) => {
    const w = d.vec2f(dd, std.abs(point.y) - halfHeight);
    return std.min(std.max(w.x, w.y), 0) + std.length(std.max(w, d.vec2f()));
  },
);
