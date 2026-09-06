import { tgpu } from 'typegpu';
import { f32, type v2f, type v3f, vec2f, vec3f } from 'typegpu/data';
import {
  abs,
  clamp,
  cross,
  distance,
  dot,
  length,
  max,
  min,
  saturate,
  select,
  sign,
  sqrt,
} from 'typegpu/std';

/**
 * Signed distance function for a sphere
 * @param point Point to evaluate
 * @param radius Radius of the sphere
 */
export const sdSphere = tgpu.fn(
  [vec3f, f32],
  f32,
)((point, radius) => {
  return length(point) - radius;
});

/**
 * Signed distance function for a 3d box
 * @param point Point to evaluate
 * @param size Half-dimensions of the box
 */
export const sdBox3d = tgpu.fn(
  [vec3f, vec3f],
  f32,
)((point, size) => {
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
export const sdRoundedBox3d = tgpu.fn(
  [vec3f, vec3f, f32],
  f32,
)((point, size, cornerRadius) => {
  'use gpu';
  const d = abs(point) - size + vec3f(cornerRadius);
  return length(max(d, vec3f(0))) + min(max(max(d.x, d.y), d.z), 0) - cornerRadius;
});

/**
 * Signed distance function for a hollow box frame
 * @param point Point to evaluate
 * @param size Half-dimensions of the box
 * @param thickness Frame thickness
 */
export const sdBoxFrame3d = tgpu.fn(
  [vec3f, vec3f, f32],
  f32,
)((point, size, thickness) => {
  'use gpu';
  const p1 = abs(point) - size;
  const q = abs(p1 + thickness) - vec3f(thickness);

  // Calculate three possible distances for each main axis being the outer one
  const d1 = length(max(vec3f(p1.x, q.y, q.z), vec3f(0))) + min(max(p1.x, max(q.y, q.z)), 0);

  const d2 = length(max(vec3f(q.x, p1.y, q.z), vec3f(0))) + min(max(q.x, max(p1.y, q.z)), 0);

  const d3 = length(max(vec3f(q.x, q.y, p1.z), vec3f(0))) + min(max(q.x, max(q.y, p1.z)), 0);

  // Return minimum of the three distances
  return min(min(d1, d2), d3);
});

/**
 * Signed distance function for a 3D line segment
 * @param point Point to evaluate
 * @param A First endpoint of the line
 * @param B Second endpoint of the line
 */
export const sdLine3d = tgpu.fn(
  [vec3f, vec3f, vec3f],
  f32,
)((point, A, B) => {
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
export const sdPlane = tgpu.fn(
  [vec3f, vec3f, f32],
  f32,
)((point, normal, height) => {
  return dot(point, normal) + height;
});

/**
 * Signed distance function for a 3D capsule
 * @param point Point to evaluate
 * @param A First endpoint of the capsule segment
 * @param B Second endpoint of the capsule segment
 * @param radius Radius of the capsule
 */
export const sdCapsule = tgpu.fn(
  [vec3f, vec3f, vec3f, f32],
  f32,
)((point, A, B, radius) => {
  'use gpu';
  const pa = point - A;
  const ba = B - A;
  const h = saturate(dot(pa, ba) / dot(ba, ba));
  return distance(pa, ba * h) - radius;
});

/**
 * Squared length of a vector.
 * @param a Vector whose squared length to compute
 */
const dot2 = (a: v2f | v3f) => {
  'use gpu';
  return dot(a, a);
};

/**
 * Unsigned distance function for a filled, zero-thickness triangle in 3D space.
 * The vertices must be distinct and non-collinear, and may use either winding order.
 *
 * @param p Point to evaluate, in the same coordinate space as the vertices
 * @param a First vertex of the triangle
 * @param b Second vertex of the triangle
 * @param c Third vertex of the triangle
 * @returns Distance to the nearest point on the triangle, including its edges;
 * zero on the triangle and positive on either side of its plane
 */
export const sdTriangle3d = (p: v3f, a: v3f, b: v3f, c: v3f) => {
  'use gpu';
  const ba = b - a;
  const pa = p - a;
  const cb = c - b;
  const pb = p - b;
  const ac = a - c;
  const pc = p - c;
  const nor = cross(ba, ac);

  const cond =
    sign(dot(cross(ba, nor), pa)) + sign(dot(cross(cb, nor), pb)) + sign(dot(cross(ac, nor), pc)) <
    2;

  return sqrt(
    select(
      // false
      (dot(nor, pa) * dot(nor, pa)) / dot2(nor),
      // true
      min(
        min(
          dot2(ba * saturate(dot(ba, pa) / dot2(ba)) - pa),
          dot2(cb * saturate(dot(cb, pb) / dot2(cb)) - pb),
        ),
        dot2(ac * saturate(dot(ac, pc) / dot2(ac)) - pc),
      ),
      cond,
    ),
  );
};

/**
 * Signed distance function for a solid cylinder centered at the origin, along the Y axis,
 * with flat caps at `y = -h` and `y = h`.
 *
 * @param p Point to evaluate, relative to the cylinder's center
 * @param r Radius of the circular cross-section in the XZ plane (non-negative)
 * @param h Half-height of the cylinder; its full height is `2 * h` (non-negative)
 * @returns Negative inside the cylinder, zero on its surface, positive outside
 */
export const sdCappedCylinder = tgpu.fn(
  [vec3f, f32, f32],
  f32,
)((p, r, h) => {
  'use gpu';
  const dd = abs(vec2f(length(p.xz), p.y)) - vec2f(r, h);
  return min(max(dd.x, dd.y), 0.0) + length(max(dd, vec2f()));
});

/**
 * Computes `a.x * b.x - a.y * b.y` for the rhombus edge projection.
 * @param a First vector
 * @param b Second vector
 */
function ndot(a: v2f, b: v2f) {
  'use gpu';
  return a.x * b.x - a.y * b.y;
}

/**
 * Signed distance function for a rhombus in the XZ plane, extruded along Y and centered
 * at the origin. Rounding expands the 2D cross-section; the caps at `y = +/-h` stay flat.
 *
 * @param p Point to evaluate, relative to the shape's center
 * @param la Half-length of the unrounded rhombus's diagonal along X (positive)
 * @param lb Half-length of the unrounded rhombus's diagonal along Z (positive)
 * @param h Half-height of the extrusion along Y (non-negative)
 * @param ra Outward rounding radius in the XZ plane (non-negative). Zero gives a sharp
 * rhombus with vertices at `(x, z) = (+/-la, 0)` and `(0, +/-lb)`; rounding increases
 * the X and Z half-extents to `la + ra` and `lb + ra`
 * @returns Negative inside the solid, zero on its surface, positive outside
 */
export const sdRhombus = tgpu.fn(
  [vec3f, f32, f32, f32, f32],
  f32,
)((p, la, lb, h, ra) => {
  'use gpu';
  const ap = abs(p);
  const b = vec2f(la, lb);
  const f = clamp(ndot(b, b - ap.xz * 2) / dot2(b), -1, 1);
  const q = vec2f(
    length(ap.xz - b * vec2f(1 - f, 1 + f) * 0.5) * sign(ap.x * b.y + ap.z * b.x - b.x * b.y) - ra,
    ap.y - h,
  );
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2f()));
});
