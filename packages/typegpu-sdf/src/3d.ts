import tgpu from 'typegpu';
import { f32, vec3f } from 'typegpu/data';
import { abs, add, dot, length, max, min, sub } from 'typegpu/std';

/**
 * Signed distance function for a sphere
 * @param p Point to evaluate
 * @param radius Radius of the sphere
 */
export const sdSphere = tgpu.fn([vec3f, f32], f32)((p, radius) => {
  return length(p) - radius;
});

/**
 * Signed distance function for a 3d box
 * @param p Point to evaluate
 * @param size Half-dimensions of the box
 */
export const sdBox3d = tgpu.fn([vec3f, vec3f], f32)((p, size) => {
  const d = sub(abs(p), size);
  return length(max(d, vec3f(0))) + min(max(max(d.x, d.y), d.z), 0);
});

/**
 * Signed distance function for a rounded 3d box
 * @param p Point to evaluate
 * @param size Half-dimensions of the box
 * @param cornerRadius Box corner radius
 */
export const sdRoundedBox3d = tgpu
  .fn([vec3f, vec3f, f32], f32)((p, size, cornerRadius) => {
    const d = add(sub(abs(p), size), vec3f(cornerRadius));
    return length(max(d, vec3f(0))) + min(max(max(d.x, d.y), d.z), 0) -
      cornerRadius;
  });

/**
 * Signed distance function for a hollow box frame
 * @param p Point to evaluate
 * @param size Half-dimensions of the box
 * @param thickness Frame thickness
 */
export const sdBoxFrame3d = tgpu
  .fn([vec3f, vec3f, f32], f32)((p, size, thickness) => {
    const p1 = sub(abs(p), size);
    const q = sub(abs(add(p1, thickness)), vec3f(thickness));

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
export const sdPlane = tgpu.fn([vec3f, vec3f, f32], f32)((p, n, h) => {
  return dot(p, n) + h;
});
