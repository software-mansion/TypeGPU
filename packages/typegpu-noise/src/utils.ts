import { tgpu, d, std } from 'typegpu';

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
 * Left circular shif of x by k positions to the left.
 */
export const rotl = tgpu.fn(
  [d.u32, d.u32],
  d.u32,
)((x, k) => {
  return std.isBeingTranspiled() ? (x << k) | (x >> (32 - k)) : (x << k) | (x >>> (32 - k));
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
  if (std.isBeingTranspiled()) {
    let x = value ^ (value >> 17);
    x *= d.u32(0xed5ad4bb);
    x ^= x >> 11;
    x *= d.u32(0xac4c1b51);
    x ^= x >> 15;
    x *= d.u32(0x31848bab);
    x ^= x >> 14;
    return x;
  } else {
    let x = value ^ (value >>> 17);
    x = Math.imul(x, 0xed5ad4bb);
    x = x ^ (x >>> 11);
    x = Math.imul(x, 0xac4c1b51);
    x = x ^ (x >>> 15);
    x = Math.imul(x, 0x31848bab);
    x = x ^ (x >>> 14);
    return x;
  }
});

const seedSaltX = 0x4ab57dfb;
const seedSaltY = 0xacdeda47;
const seedSaltZ = 0xbca0294b;
const seedSaltW = 0xd94a5f35;

export const scrambleSeed1 = tgpu.fn(
  [d.f32],
  d.u32,
)((value) => {
  return hash(std.bitcastF32toU32(value) ^ seedSaltX);
});

export const scrambleSeed2 = tgpu.fn(
  [d.vec2f],
  d.vec2u,
)((value) => {
  const u32Value = std.bitcastF32toU32(value);
  return d.vec2u(
    hash(u32Value.x ^ seedSaltX),
    hash(u32Value.y ^ seedSaltY),
  );
});

export const scrambleSeed3 = tgpu.fn(
  [d.vec3f],
  d.vec3u,
)((value) => {
  const u32Value = std.bitcastF32toU32(value);
  return d.vec3u(
    hash(u32Value.x ^ seedSaltX),
    hash(u32Value.y ^ seedSaltY),
    hash(u32Value.z ^ seedSaltZ),
  );
});

export const scrambleSeed4 = tgpu.fn(
  [d.vec4f],
  d.vec4u,
)((value) => {
  const u32Value = std.bitcastF32toU32(value);
  return d.vec4u(
    hash(u32Value.x ^ seedSaltX),
    hash(u32Value.y ^ seedSaltY),
    hash(u32Value.z ^ seedSaltZ),
    hash(u32Value.w ^ seedSaltW),
  );
});
