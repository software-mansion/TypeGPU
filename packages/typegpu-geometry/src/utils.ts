import tgpu from 'typegpu';
import { bool, f32, struct, vec2f } from 'typegpu/data';
import { add, dot, mix, mul, normalize, select, sub } from 'typegpu/std';

/** Shorthand for `add(a, mul(b, f))` due to lack of operators */
export const addMul = tgpu.fn([vec2f, vec2f, f32], vec2f)((a, b, f) => {
  return add(a, mul(b, f));
});

/** Rotates a 2D vector counter-clockwise by 90 degrees */
export const rot90ccw = tgpu.fn([vec2f], vec2f)((v) => {
  return vec2f(-v.y, v.x);
});

/** Rotates a 2D vector clockwise by 90 degrees */
export const rot90cw = tgpu.fn([vec2f], vec2f)((v) => {
  return vec2f(v.y, -v.x);
});

/**
 * Computes 2D cross product, which results in a scalar.
 * Importantly, for two unit vectors, this is the `sin(angle)` between them.
 */
export const cross2d = tgpu.fn([vec2f, vec2f], f32)((a, b) => {
  return a.x * b.y - a.y * b.x;
});

/**
 * Finds bisector direction between two vectors.
 * The direction will always be on the counter-clockwise arc between the vectors,
 * so vector order is important.
 */
export const bisectCcw = tgpu.fn([vec2f, vec2f], vec2f)((a, b) => {
  const sin = cross2d(a, b);
  const sinSign = select(f32(-1), f32(1), sin >= 0);
  const orthoA = rot90ccw(a);
  const orthoB = rot90cw(b);
  const dir = select(
    mul(add(a, b), sinSign),
    add(orthoA, orthoB),
    dot(a, b) < 0,
  );
  return normalize(dir);
});

/**
 * Finds the miter point of tangents to two points on a circle.
 * The miter point is on the smaller arc.
 */
export const miterPointNoCheck = tgpu.fn([vec2f, vec2f], vec2f)((a, b) => {
  const ab = add(a, b);
  return mul(ab, 2 / dot(ab, ab));
});

/**
 * Finds bisector direction between two vectors.
 * There is no check done to be on the CW part, instead
 * it is assumed that a and b are significantly less than 180 degrees apart.
 */
export const bisectNoCheck = tgpu.fn([vec2f, vec2f], vec2f)((a, b) => {
  return normalize(add(a, b));
});

export const midPoint = tgpu.fn([vec2f, vec2f], vec2f)((a, b) => {
  return mul(0.5, add(a, b));
});

export const slerpApprox = tgpu.fn([vec2f, vec2f, f32], vec2f)((a, b, t) => {
  const mid = bisectNoCheck(a, b);
  let a_ = vec2f(a);
  let b_ = vec2f(mid);
  let t_ = 2 * t;
  if (t > 0.5) {
    a_ = vec2f(mid);
    b_ = vec2f(b);
    t_ -= 1;
  }
  return normalize(mix(a_, b_, t_));
});

const Intersection = struct({
  valid: bool,
  t: f32,
  point: vec2f,
});

export const intersectLines = tgpu.fn(
  [vec2f, vec2f, vec2f, vec2f],
  Intersection,
)(
  (A1, A2, B1, B2) => {
    const a = sub(A2, A1);
    const b = sub(B2, B1);
    const axb = cross2d(a, b);
    const AB = sub(B1, A1);
    const t = cross2d(AB, b) / axb;
    return {
      valid: axb !== 0 && t >= 0 && t <= 1,
      t,
      point: addMul(A1, a, t),
    };
  },
);
