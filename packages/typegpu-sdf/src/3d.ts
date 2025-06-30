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
 * Signed distance function for a hollow box frame
 * @param p Point to evaluate
 * @param b Box dimensions (half-extents)
 * @param e Frame thickness
 */
export const sdBoxFrame = tgpu['~unstable']
  .fn([vec3f, vec3f, f32], f32)((p, b, e) => {
    'kernel & js';
    const p1 = sub(abs(p), b);
    const q = sub(abs(add(p1, e)), vec3f(e));

    // Calculate three possible distances for each main axis being the outer one
    const d1 = length(max(vec3f(p1.x, q.y, q.z), vec3f(0))) +
      min(max(p1.x, max(q.y, q.z)), 0);

    const d2 = length(max(vec3f(q.x, p1.y, q.z), vec3f(0))) +
      min(max(q.x, max(p1.y, q.z)), 0);

    const d3 = length(max(vec3f(q.x, q.y, p1.z), vec3f(0))) +
      min(max(q.x, max(q.y, p1.z)), 0);

    // Return minimum of the three distances
    return min(min(d1, d2), d3);
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
