import { vec2f } from 'typegpu/data';
import { addMul, bisectCcw, slerpApprox } from '../../utils.ts';
import type { JoinInput } from '../types.ts';

export function round(join: JoinInput, joinVertexIndex: number, maxJoinCount: number) {
  'use gpu';
  if (joinVertexIndex === 0) {
    return vec2f(join.v);
  }
  const dir = slerpApprox(join.d, bisectCcw(join.start, join.end), joinVertexIndex / maxJoinCount);
  return addMul(join.C.position, dir, join.C.radius);
}
