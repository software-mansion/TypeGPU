import { vec2f } from 'typegpu/data';
import type { JoinInput } from '../types.ts';
import tgpu from 'typegpu';

export const arrowCapParamsSlot = tgpu.slot({
  length: 7.5,
  width: 1.5,
  slant: 0.8,
});

export function arrow(join: JoinInput, joinVertexIndex: number, _maxJoinCount: number) {
  'use gpu';
  const v0 = join.cross - join.fw * arrowCapParamsSlot.$.length;
  const v1 = v0 + (join.cross - join.fw * arrowCapParamsSlot.$.slant) * arrowCapParamsSlot.$.width;
  if (joinVertexIndex === 0) {
    return join.C.position + v0 * join.C.radius;
  }
  if (joinVertexIndex === 1) {
    return join.C.position + v1 * join.C.radius;
  }
  return vec2f(join.C.position);
}
