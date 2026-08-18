import { vec2f } from 'typegpu/data';
import type { JoinInput } from '../types.ts';

export function triangle(join: JoinInput, joinVertexIndex: number, _maxJoinCount: number) {
  'use gpu';
  if (joinVertexIndex === 0) {
    return vec2f(join.v);
  }
  return join.C.position + join.fw * join.C.radius;
}
