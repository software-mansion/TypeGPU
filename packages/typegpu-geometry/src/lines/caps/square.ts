import { vec2f } from 'typegpu/data';
import { select } from 'typegpu/std';
import type { JoinInput } from '../types.ts';

export function square(join: JoinInput, joinVertexIndex: number, _maxJoinCount: number) {
  'use gpu';
  if (joinVertexIndex === 0) {
    return vec2f(join.v);
  }
  return (
    join.C.position + select(join.fw + join.cross, join.fw, joinVertexIndex > 1) * join.C.radius
  );
}
