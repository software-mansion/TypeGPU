import { vec2f } from 'typegpu/data';
import { addMul, bisectCcw, slerpApprox } from '../../utils.ts';
import type { JoinInput } from '../types.ts';

export function round(
  join: JoinInput,
  joinIndex: number,
  maxJoinCount: number,
) {
  'use gpu';
  if (joinIndex === 0) {
    return vec2f(join.v);
  }
  const dir = slerpApprox(
    join.d,
    bisectCcw(join.start, join.end),
    joinIndex / maxJoinCount,
  );
  return addMul(join.C.position, dir, join.C.radius);
}
