import { vec2f } from 'typegpu/data';
import { normalize, select, sign } from 'typegpu/std';
import { addMul, cross2d, rot90ccw } from '../../utils.ts';
import type { JoinInput } from '../types.ts';

export function square(
  join: JoinInput,
  joinIndex: number,
  _maxJoinCount: number,
) {
  'use gpu';
  if (joinIndex === 0) {
    return vec2f(join.v);
  }
  const fw = normalize(join.fw);
  const vert = rot90ccw(fw);
  const sgn = sign(cross2d(fw, join.d));
  return addMul(
    join.C.position,
    select(addMul(fw, vert, sgn), fw, joinIndex > 1),
    join.C.radius,
  );
}
