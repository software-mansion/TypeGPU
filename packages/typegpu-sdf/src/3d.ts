import tgpu from 'typegpu';
import { f32, vec3f } from 'typegpu/data';
import { abs, add, dot, length, max, min, sub } from 'typegpu/std';

/**
 * Signed distance function for a sphere
 * @param p Point to evaluate
 * @param r Radius of the sphere
 */
export const sdSphere = tgpu['~unstable']
  .fn([vec3f, f32], f32)((p, r) => {
    'kernel & js';
    return length(p) - r;
  });

export const sdBox = tgpu['~unstable']
  .fn([vec3f, vec3f], f32)((p, b) => {
    'kernel & js';
    const d = sub(abs(p), b);
    return length(max(d, vec3f(0))) + min(max(max(d.x, d.y), d.z), 0);
  });

export const sdRoundedBox = tgpu['~unstable']
  .fn([vec3f, vec3f, f32], f32)((p, b, r) => {
    'kernel & js';
    const d = add(sub(abs(p), b), vec3f(r));
    return length(max(d, vec3f(0))) + min(max(max(d.x, d.y), d.z), 0) - r;
  });

/**
 * Signed distance function for an infinite plane
 * @param p Point to evaluate
 * @param n Normal vector of the plane (must be normalized)
 * @param h Height/offset of the plane along the normal
 */
export const sdPlane = tgpu['~unstable']
  .fn([vec3f, vec3f, f32], f32)((p, n, h) => {
    'kernel & js';
    return dot(p, n) + h;
  });
