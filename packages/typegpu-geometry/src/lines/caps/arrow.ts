import { vec2f } from 'typegpu/data';
import { neg, normalize, sign } from 'typegpu/std';
import { cross2d, rot90ccw } from '../../utils.ts';
import type { JoinInput } from '../types.ts';

export function arrow(join: JoinInput, joinVertexIndex: number, _maxJoinCount: number) {
  'use gpu';
  const bw = neg(normalize(join.fw));
  const vert = rot90ccw(bw);
  const sgn = sign(cross2d(bw, join.d));
  const svert = vert * sgn;
  const v0 = svert + bw * 7.5;
  const v1 = v0 + (bw + svert) * 1.5;
  if (joinVertexIndex === 0) {
    return join.C.position + v0 * join.C.radius;
  }
  if (joinVertexIndex === 1) {
    return join.C.position + v1 * join.C.radius;
  }
  return vec2f(join.C.position);
}
