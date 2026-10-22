import { f32, vec2f } from 'typegpu/data';
import { mix } from 'typegpu/std';
import type { JoinInput } from '../types.ts';

/**
 * Cuts the outside of a turn with a straight edge between the sides of the two segments.
 */
export function bevel(join: JoinInput, joinVertexIndex: number, maxJoinCount: number) {
  'use gpu';
  if (joinVertexIndex === 0) {
    return vec2f(join.v);
  }
  const t = f32(joinVertexIndex) / f32(maxJoinCount);
  const dir = mix(join.d, (join.start + join.end) * 0.5, t);
  return join.C.position + dir * join.C.radius;
}
