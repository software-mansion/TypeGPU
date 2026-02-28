import tgpu from 'typegpu';
import { arrayOf, bool, f32, struct, u32, vec2f } from 'typegpu/data';
import { add, clamp, dot, length, max, mix, mul, normalize, select, sqrt, sub } from 'typegpu/std';
import { addMul, bisectCcw, cross2d, midPoint, rot90ccw } from '../utils.ts';

/** Intersects tangent to point on a circle `a` with line from center in direction `n`. */
export const intersectTangent = tgpu.fn(
  [vec2f, vec2f],
  vec2f,
)((a, n) => {
  const cos_ = dot(a, n);
  return mul(n, 1 / cos_);
});

/**
 * Finds the miter point of tangents to two points on a circle.
 * The miter point is on the smaller arc.
 */
export const miterPointNoCheck = tgpu.fn(
  [vec2f, vec2f],
  vec2f,
)((a, b) => {
  const ab = add(a, b);
  return mul(ab, 2 / dot(ab, ab));
});

/**
 * Finds the miter point of tangents to two points on respective circles.
 * The miter point is on the counter-clockwise arc between the circles if possible,
 * otherwise at "infinity".
 */
export const miterPoint = tgpu.fn(
  [vec2f, vec2f],
  vec2f,
)((a, b) => {
  const sin_ = cross2d(a, b);
  const bisection = bisectCcw(a, b);
  const b2 = dot(b, b);
  const cos_ = dot(a, b);
  const diff = b2 - cos_;
  // TODO: make this check relative
  if (diff * diff < 1e-4) {
    // the vectors are almost colinear
    return midPoint(a, b);
  }
  if (sin_ < 0) {
    // if the miter is at infinity, just make it super far
    return mul(bisection, -1e6);
  }
  const t = diff / sin_;
  return addMul(a, rot90ccw(a), t);
});

const ExternalNormals = struct({
  n1: vec2f,
  n2: vec2f,
});

/**
 * Computes external tangent directions (normals to tangent)
 * for two circles at a `distance` with radii `r1` and `r2`.
 */
export const externalNormals = tgpu.fn(
  [vec2f, f32, f32],
  ExternalNormals,
)((distance, r1, r2) => {
  const dNorm = normalize(distance);
  const expCos = (r1 - r2) / length(distance);
  const expSin = sqrt(max(0, 1 - expCos * expCos));
  const a = dNorm.x * expCos;
  const b = dNorm.y * expSin;
  const c = dNorm.x * expSin;
  const d = dNorm.y * expCos;
  const n1 = vec2f(a - b, c + d);
  const n2 = vec2f(a + b, -c + d);
  return ExternalNormals({ n1, n2 });
});

const Intersection = struct({
  valid: bool,
  t: f32,
  point: vec2f,
});

export const intersectLines = tgpu.fn(
  [vec2f, vec2f, vec2f, vec2f],
  Intersection,
)((A1, A2, B1, B2) => {
  const a = sub(A2, A1);
  const b = sub(B2, B1);
  const axb = cross2d(a, b);
  const AB = sub(B1, A1);
  const t = cross2d(AB, b) / axb;
  return {
    valid: axb !== 0,
    t,
    point: addMul(A1, a, t),
  };
});

const LimitAlongResult = struct({
  a: vec2f,
  b: vec2f,
  limitWasHit: bool,
});

/**
 * Leaves a and b separate if no collision, otherwise merges them towards "middle".
 */
export const limitTowardsMiddle = tgpu.fn(
  [vec2f, vec2f, vec2f, vec2f],
  LimitAlongResult,
)((middle, dir, p1, p2) => {
  const t1 = dot(sub(p1, middle), dir);
  const t2 = dot(sub(p2, middle), dir);
  if (t1 <= t2) {
    return LimitAlongResult({ a: p1, b: p2, limitWasHit: false });
  }
  const t = clamp(t1 / (t1 - t2), 0, 1);
  const p = mix(p1, p2, t);
  return LimitAlongResult({ a: p, b: p, limitWasHit: true });
});

export const projectToLineSegment = tgpu.fn(
  [vec2f, vec2f, vec2f],
  vec2f,
)((A, B, point) => {
  const p = sub(point, A);
  const AB = sub(B, A);
  const t = clamp(dot(p, AB) / dot(AB, AB), 0, 1);
  const projP = addMul(A, AB, t);
  return projP;
});

export const uvToLineSegment = tgpu.fn(
  [vec2f, vec2f, vec2f],
  vec2f,
)((A, B, point) => {
  const p = sub(point, A);
  const AB = sub(B, A);
  const x = dot(p, AB) / dot(AB, AB);
  const y = cross2d(normalize(AB), p);
  return vec2f(x, y);
});

const lookup = tgpu.const(arrayOf(u32, 8), [
  5, // 000 c >= b >= a
  3, // 001 INVALID
  4, // 010 b > c >= a
  3, // 011 b >= a > c
  2, // 100 c >= a > b
  1, // 101 a > c >= b
  0, // 110 INVALID
  0, // 111 a > b > c
]);

export const rank3 = tgpu.fn(
  [bool, bool, bool],
  u32,
)((aGb, bGc, aGc) => {
  const code = (u32(aGb) << 2) | (u32(bGc) << 1) | u32(aGc);
  return lookup.$[code] as number;
});

export const isCCW = tgpu.fn(
  [f32, bool, f32, bool],
  bool,
)((aX, aYSign, bX, bYSign) => {
  const sameSide = aYSign === bYSign;
  return select(aYSign, aYSign === aX >= bX, sameSide);
});
