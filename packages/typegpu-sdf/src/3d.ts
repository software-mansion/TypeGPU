import tgpu from 'typegpu';
import { f32, vec3f } from 'typegpu/data';
import { abs, distance, dot, length, max, min, saturate } from 'typegpu/std';

/**
 * Signed distance function for a sphere
 * @param point Point to evaluate
 * @param radius Radius of the sphere
 */
export const sdSphere = tgpu.fn([vec3f, f32], f32)((point, radius) => {
  return length(point) - radius;
});

/**
 * Signed distance function for a 3d box
 * @param point Point to evaluate
 * @param size Half-dimensions of the box
 */
export const sdBox3d = tgpu.fn([vec3f, vec3f], f32)((point, size) => {
  'use gpu';
  const d = abs(point) - size;
  return length(max(d, vec3f(0))) + min(max(max(d.x, d.y), d.z), 0);
});

/**
 * Signed distance function for a rounded 3d box
 * @param point Point to evaluate
 * @param size Half-dimensions of the box
 * @param cornerRadius Box corner radius
 */
export const sdRoundedBox3d = tgpu
  .fn([vec3f, vec3f, f32], f32)((point, size, cornerRadius) => {
    'use gpu';
    const d = abs(point) - size + vec3f(cornerRadius);
    return length(max(d, vec3f(0))) + min(max(max(d.x, d.y), d.z), 0) -
      cornerRadius;
  });

/**
 * Signed distance function for a hollow box frame
 * @param point Point to evaluate
 * @param size Half-dimensions of the box
 * @param thickness Frame thickness
 */
export const sdBoxFrame3d = tgpu
  .fn([vec3f, vec3f, f32], f32)((point, size, thickness) => {
    'use gpu';
    const p1 = abs(point) - size;
    const q = abs(p1 + thickness) - vec3f(thickness);

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
 * Signed distance function for a 3D line segment
 * @param point Point to evaluate
 * @param A First endpoint of the line
 * @param B Second endpoint of the line
 */
export const sdLine3d = tgpu.fn([vec3f, vec3f, vec3f], f32)((point, A, B) => {
  'use gpu';
  const pa = point - A;
  const ba = B - A;
  const h = max(0, min(1, dot(pa, ba) / dot(ba, ba)));
  return distance(pa, ba * h);
});

/**
 * Signed distance function for an infinite plane
 * @param point Point to evaluate
 * @param normal Normal vector of the plane (must be normalized)
 * @param height Height/offset of the plane along the normal
 */
export const sdPlane = tgpu.fn([vec3f, vec3f, f32], f32)(
  (point, normal, height) => {
    return dot(point, normal) + height;
  },
);

/**
 * Signed distance function for a 3D capsule
 * @param point Point to evaluate
 * @param A First endpoint of the capsule segment
 * @param B Second endpoint of the capsule segment
 * @param radius Radius of the capsule
 */
export const sdCapsule = tgpu
  .fn([vec3f, vec3f, vec3f, f32], f32)((point, A, B, radius) => {
    'use gpu';
    const pa = point - A;
    const ba = B - A;
    const h = saturate(dot(pa, ba) / dot(ba, ba));
    return distance(pa, ba * h) - radius;
  });
