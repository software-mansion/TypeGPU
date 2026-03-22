import tgpu, { d } from 'typegpu';

/** Complex multiply: (a.x + i a.y) * (b.x + i b.y), stored as vec2f. */
export const complexMul = tgpu.fn([d.vec2f, d.vec2f], d.vec2f)((a, b) => {
  'use gpu';
  return d.vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
});
