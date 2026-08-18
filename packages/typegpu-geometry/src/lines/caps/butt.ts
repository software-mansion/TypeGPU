import type { JoinInput } from '../types.ts';

export function butt(join: JoinInput, _joinVertexIndex: number, _maxJoinCount: number) {
  'use gpu';
  return join.C.position + join.cross * join.C.radius;
}
