import { vec2f } from 'typegpu/data';
import { normalize } from 'typegpu/std';
import type { JoinInput } from '../types.ts';

export function triangle(join: JoinInput, joinVertexIndex: number, _maxJoinCount: number) {
  'use gpu';
  if (joinVertexIndex === 0) {
    return vec2f(join.v);
  }
  const fw = normalize(join.fw);
  return join.C.position + fw * join.C.radius;
}
