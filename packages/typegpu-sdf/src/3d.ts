import tgpu from 'typegpu';
import { f32, v2f, type v3f, vec2f, vec3f } from 'typegpu/data';
import {
  abs,
  add,
  clamp,
  cross,
  dot,
  length,
  max,
  min,
  saturate,
  select,
  sign,
  sqrt,
  sub,
} from 'typegpu/std';

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
  const d = sub(abs(point), size);
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
    const d = add(sub(abs(point), size), vec3f(cornerRadius));
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
    const p1 = sub(abs(point), size);
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
 * Signed distance function for a 3D line segment
 * @param point Point to evaluate
 * @param A First endpoint of the line
 * @param B Second endpoint of the line
 */
export const sdLine3d = tgpu.fn([vec3f, vec3f, vec3f], f32)((point, A, B) => {
  const pa = sub(point, A);
  const ba = sub(B, A);
  const h = max(0, min(1, dot(pa, ba) / dot(ba, ba)));
  return length(sub(pa, ba.mul(h)));
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
    const pa = sub(point, A);
    const ba = sub(B, A);
    const h = saturate(dot(pa, ba) / dot(ba, ba));
    return length(sub(pa, ba.mul(h))) - radius;
  });

const dot2 = (a: v2f | v3f) => {
  'use gpu';
  return dot(a, a);
};

export const sdTriangle3d = (p: v3f, a: v3f, b: v3f, c: v3f) => {
  'use gpu';
  const ba = b.sub(a);
  const pa = p.sub(a);
  const cb = c.sub(b);
  const pb = p.sub(b);
  const ac = a.sub(c);
  const pc = p.sub(c);
  const nor = cross(ba, ac);

  const cond = sign(dot(cross(ba, nor), pa)) +
      sign(dot(cross(cb, nor), pb)) +
      sign(dot(cross(ac, nor), pc)) < 2;

  return sqrt(
    select(
      // false
      dot(nor, pa) * dot(nor, pa) / dot2(nor),
      // true
      min(
        min(
          dot2(ba.mul(saturate(dot(ba, pa) / dot2(ba))).sub(pa)),
          dot2(cb.mul(saturate(dot(cb, pb) / dot2(cb))).sub(pb)),
        ),
        dot2(ac.mul(saturate(dot(ac, pc) / dot2(ac))).sub(pc)),
      ),
      cond,
    ),
  );
};

export const sdCappedCylinder = tgpu.fn([vec3f, f32, f32], f32)((p, r, h) => {
  const dd = abs(vec2f(length(p.xz), p.y)).sub(vec2f(r, h));
  return min(max(dd.x, dd.y), 0.0) + length(max(dd, vec2f()));
});

const ndot = (a: v2f, b: v2f) => {
  'use gpu';
  return a.x * b.x - a.y * b.y;
};

export const sdRhombus = tgpu.fn([vec3f, f32, f32, f32, f32], f32)(
  (p, la, lb, h, ra) => {
    const ap = abs(p);
    const b = vec2f(la, lb);
    const f = clamp(ndot(b, b.sub(ap.xz.mul(2))) / dot2(b), -1, 1);
    const q = vec2f(
      length(ap.xz.sub(b.mul(vec2f(1 - f, 1 + f)).mul(0.5))) *
          sign(ap.x * b.y + ap.z * b.x - b.x * b.y) -
        ra,
      ap.y - h,
    );
    return min(max(q.x, q.y), 0.0) + length(max(q, vec2f()));
  },
);
