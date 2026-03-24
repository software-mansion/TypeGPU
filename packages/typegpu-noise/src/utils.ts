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
/*
 * Left circular shif of x by k positions.
 */
export const rotl = tgpu.fn(
  [d.u32, d.u32],
  d.u32,
)((x, k) => {
  return (x << k) | (x >> (32 - k));
});

/*
 * Converts u32 to f32 value in the range [0.0, 1.0).
 */
export const u32To01F32 = tgpu.fn(
  [d.u32],
  d.f32,
)((value) => {
  const mantissa = value >> 9;
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
)((v) => {
  let x = v ^ (v >> 17);
  x *= d.u32(0xed5ad4bb);
  x ^= x >> 11;
  x *= d.u32(0xac4c1b51);
  x ^= x >> 15;
  x *= d.u32(0x31848bab);
  x ^= x >> 14;
  return x;
});

/**
 * Emulated 64-bit unsigned addition on two vec2u values.
 * Each vec2u represents a u64: x = low 32 bits, y = high 32 bits.
 */
export const u64Add = tgpu.fn(
  [d.vec2u, d.vec2u],
  d.vec2u,
)((a, b) => {
  const rl = a.x + b.x;
  const carry = d.u32(rl < a.x && rl < b.x);
  const rh = a.y + b.y + carry;
  return d.vec2u(rl, rh);
});

/**
 * Emulated 64-bit unsigned multiplication on two vec2u values.
 * Each vec2u represents a u64: x = low 32 bits, y = high 32 bits.
 */
export const u64Mul = tgpu.fn(
  [d.vec2u, d.vec2u],
  d.vec2u,
)((a, b) => {
  const all = d.u32(a.x & 0xffff);
  const alh = d.u32(a.x >> 16);
  const ahl = d.u32(a.y & 0xffff);
  const ahh = d.u32(a.y >> 16);
  const bll = d.u32(b.x & 0xffff);
  const blh = d.u32(b.x >> 16);
  const bhl = d.u32(b.y & 0xffff);
  const bhh = d.u32(b.y >> 16);

  const row0_0 = d.u32(bll * all);
  const row0_1 = d.u32(bll * alh);
  const row0_2 = d.u32(bll * ahl);
  const row0_3 = d.u32(bll * ahh);

  const row1_0 = d.u32(blh * all);
  const row1_1 = d.u32(blh * alh);
  const row1_2 = d.u32(blh * ahl);

  const row2_0 = d.u32(bhl * all);
  const row2_1 = d.u32(bhl * alh);

  const row3_0 = d.u32(bhh * all);

  const r1 = row0_0 & 0xffff;
  let r2 = (row0_0 >> 16) + (row0_1 & 0xffff) + (row1_0 & 0xffff);
  let r3 =
    (row0_1 >> 16) + (row0_2 & 0xffff) + (row1_0 >> 16) + (row1_1 & 0xffff) + (row2_0 & 0xffff);
  let r4 =
    (row0_2 >> 16) +
    (row0_3 & 0xffff) +
    (row1_1 >> 16) +
    (row1_2 & 0xffff) +
    (row2_0 >> 16) +
    (row2_1 & 0xffff) +
    (row3_0 & 0xffff);

  r3 += r2 >> 16;
  r2 &= 0xffff;
  r4 += r3 >> 16;
  r3 &= 0xffff;
  r4 &= 0xffff;

  return d.vec2u(r1 | (r2 << 16), r3 | (r4 << 16));
});
