import tgpu, { d } from 'typegpu';

/** Complex multiply: (a.x + i a.y) * (b.x + i b.y), stored as vec2f. */
export const complexMul = tgpu.fn(
  [d.vec2f, d.vec2f],
  d.vec2f,
)((a, b) => {
  return d.vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
});

/** Veltkamp split of an f32 into (hi, lo) with hi + lo ≈ x. */
export const splitF32 = tgpu.fn(
  [d.f32],
  d.vec2f,
)((x) => {
  const c = 4097.0 * x;
  const hi = c - (c - x);
  const lo = x - hi;
  return d.vec2f(hi, lo);
});

/**
 * Double-single complex twiddle `w ≈ wh + wl` (per-component) times single complex `a`.
 * `a * (wh + wl) = a*wh + a*wl` in complex arithmetic.
 */
export const complexCmulDs = tgpu.fn(
  [d.vec2f, d.vec2f, d.vec2f],
  d.vec2f,
)((a, wh, wl) => {
  'use gpu';
  return complexMul(a, wh) + complexMul(a, wl);
});

/**
 * Split a complex value into hi/lo parts (vec4: re_hi, im_hi, re_lo, im_lo) for DS multiply.
 */
export const splitComplexFromVec2 = tgpu.fn(
  [d.vec2f],
  d.vec4f,
)((w) => {
  const sx = splitF32(w.x);
  const sy = splitF32(w.y);
  return d.vec4f(sx.x, sy.x, sx.y, sy.y);
});
