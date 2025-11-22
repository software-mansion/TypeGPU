import { mul, normalize, sign } from 'typegpu/std';
import { addMul, cross2d, rot90ccw } from '../../utils.ts';
import type { JoinInput } from '../types.ts';

export function butt(
  join: JoinInput,
  _joinIndex: number,
  _maxJoinCount: number,
) {
  'use gpu';
  const fw = normalize(join.fw);
  const vert = rot90ccw(fw);
  const sgn = sign(cross2d(fw, join.d));
  const svert = mul(vert, sgn);
  return addMul(join.C.position, svert, join.C.radius);
}
