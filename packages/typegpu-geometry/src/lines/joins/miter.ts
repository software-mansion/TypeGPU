import tgpu from 'typegpu';
import type { v2f } from 'typegpu/data';
import { vec2f } from 'typegpu/data';
import { dot, mul, normalize, select } from 'typegpu/std';
import {
  addMul,
  bisectCcw,
  cross2d,
  miterPointNoCheck,
  rot90ccw,
} from '../../utils.ts';
import type { JoinInput } from '../types.ts';

export const miterJoinLimitSlot = tgpu.slot(2);

/**
 * Finds the miter point of tangents to two points on respective circles.
 */
function miterPointBisectorWhenClockwise(a: v2f, b: v2f) {
  'use gpu';
  const sin_ = cross2d(a, b);
  if (sin_ <= 0) {
    return bisectCcw(a, b);
  }
  return miterPointNoCheck(a, b);
}

/**
 * Finds the miter point of tangents to two points on respective circles.
 */
function miterPoint(a: v2f, b: v2f) {
  'use gpu';
  const sin_ = cross2d(a, b);
  const b2 = dot(b, b);
  const cos_ = dot(a, b);
  const diff = b2 - cos_;
  const t = diff / sin_;
  return addMul(a, rot90ccw(a), t);
}

/**
 * Limits the miter point to the given limit ratio, which is
 * a length relative to the control point radius.
 */
function miterLimit(miter: v2f, limitRatio: number) {
  'use gpu';
  const m2 = dot(miter, miter);
  const l2 = limitRatio * limitRatio;
  if (m2 > l2) {
    return mul(normalize(miter), (limitRatio - 1) * (l2 - 1) / (m2 - 1) + 1);
  }
  return vec2f(miter);
}

export function miter(
  join: JoinInput,
  joinIndex: number,
  _maxJoinCount: number,
) {
  'use gpu';
  if (joinIndex === 0) {
    return vec2f(join.v);
  }
  const miter = miterLimit(
    miterPointBisectorWhenClockwise(join.start, join.end),
    miterJoinLimitSlot.$,
  );
  const dir = select(miterPoint(join.d, miter), miter, joinIndex > 1);
  return addMul(join.C.position, dir, join.C.radius);
}
