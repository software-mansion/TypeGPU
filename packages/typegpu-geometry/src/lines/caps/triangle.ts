import { vec2f } from 'typegpu/data';
import { normalize } from 'typegpu/std';
import { addMul } from '../../utils.ts';
import type { JoinInput } from '../types.ts';

export function triangle(
  join: JoinInput,
  joinIndex: number,
  _maxJoinCount: number,
) {
  'use gpu';
  if (joinIndex === 0) {
    return vec2f(join.v);
  }
  const fw = normalize(join.fw);
  return addMul(join.C.position, fw, join.C.radius);
}
