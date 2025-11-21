import { neg, normalize, select, sign } from 'typegpu/std';
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
  const v0 = addMul(join.v, bw, 7.5 * join.C.radius);
  const v1 = addMul(v0, addMul(bw, vert, sgn), 1.5 * join.C.radius);
  if (joinIndex === 0) {
    return v0;
  } else {
    return select(join.C.position, v1, joinIndex === 1);
  }
}
