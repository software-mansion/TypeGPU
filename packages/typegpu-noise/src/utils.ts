import tgpu, { d, std } from 'typegpu';

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type PrefixKeys<Prefix extends string, T> = {
  [K in keyof T as K extends string ? `${Prefix}${K}` : K]: T[K];
};

/**
 * Works as a replacement for smoothstep, but with a continuous
 * second derivative, which in e.g. smooth normals
 */
export function quinticInterpolation(t: d.v2f): d.v2f;
export function quinticInterpolation(t: d.v3f): d.v3f;
export function quinticInterpolation(t: d.vecBase): d.vecBase {
  'use gpu';
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Derivative of {@link quinticInterpolation}
 */
export function quinticDerivative(t: d.v2f): d.v2f;
export function quinticDerivative(t: d.v3f): d.v3f;
export function quinticDerivative(t: d.vecBase): d.vecBase {
  'use gpu';
  return 30 * t * t * (t * (t - 2) + 1);
}

/**
 * Left circular shif of x by k positions.
 */
export const rotl = tgpu.fn(
  [d.u32, d.u32],
  d.u32,
)((x, k) => {
  return (x << k) | (x >> (32 - k));
});

/**
 * Converts `u32` to `f32` value in the range `[0.0, 1.0)`.
 */
export const u32To01F32 = tgpu.fn(
  [d.u32],
  d.f32,
)((value) => {
  const mantissa = value & 0x007fffff;
  const bits = 0x3f800000 | mantissa;
  const f = std.bitcastU32toF32(bits);
  return f - 1;
});

/**
 * Simple hashing function to scramble the seed.
 * Keep in mind that `hash(0) -> 0`.
 *
 * Incorporated from https://github.com/chaos-matters/chaos-master
 * by deluksic and Komediruzecki
 */
export const hash = tgpu.fn(
  [d.u32],
  d.u32,
)((value) => {
  let x = value ^ (value >> 17);
  x *= d.u32(0xed5ad4bb);
  x ^= x >> 11;
  x *= d.u32(0xac4c1b51);
  x ^= x >> 15;
  x *= d.u32(0x31848bab);
  x ^= x >> 14;
  return x;
});
