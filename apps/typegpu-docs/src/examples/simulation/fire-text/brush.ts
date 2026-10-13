import { d } from 'typegpu';

const POINTER_VELOCITY_SCALE = 30;
const POINTER_DELTA_CLAMP = 3;

export function strokeVelocity(from: d.v2f, to: d.v2f) {
  const dx = Math.max(-POINTER_DELTA_CLAMP, Math.min(POINTER_DELTA_CLAMP, to.x - from.x));
  const dy = Math.max(-POINTER_DELTA_CLAMP, Math.min(POINTER_DELTA_CLAMP, to.y - from.y));
  return d.vec2f(dx * POINTER_VELOCITY_SCALE, dy * POINTER_VELOCITY_SCALE);
}
