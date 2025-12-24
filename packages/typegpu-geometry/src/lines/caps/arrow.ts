import { vec2f } from 'typegpu/data';
import { add, mul, neg, normalize, sign } from 'typegpu/std';
import { addMul, cross2d, rot90ccw } from '../../utils.ts';
import type { JoinInput } from '../types.ts';

export function arrow(
  join: JoinInput,
  joinIndex: number,
  _maxJoinCount: number,
) {
  'use gpu';
  const bw = neg(normalize(join.fw));
  const vert = rot90ccw(bw);
  const sgn = sign(cross2d(bw, join.d));
  const svert = mul(vert, sgn);
  const v0 = add(svert, mul(bw, 7.5));
  const v1 = addMul(v0, add(bw, svert), 1.5);
  if (joinIndex === 0) {
    return addMul(join.C.position, v0, join.C.radius);
  }
  if (joinIndex === 1) {
    return addMul(join.C.position, v1, join.C.radius);
  }
  return vec2f(join.C.position);
}
