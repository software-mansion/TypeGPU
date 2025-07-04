import { createDualImpl } from '../shared/generators.ts';
import { $internal } from '../shared/symbols.ts';
import { snip } from './dataTypes.ts';
import type {
  AbstractFloat,
  AbstractInt,
  Bool,
  F16,
  F32,
  I32,
  U16,
  U32,
} from './wgslTypes.ts';

export const abstractInt = {
  [$internal]: true,
  type: 'abstractInt',
} as AbstractInt;

export const abstractFloat = {
  [$internal]: true,
  type: 'abstractFloat',
} as AbstractFloat;

const boolCast = createDualImpl(
  // CPU implementation
  (v?: number | boolean) => {
    if (v === undefined) {
      return false;
    }
    if (typeof v === 'boolean') {
      return v;
    }
    return !!v;
  },
  // GPU implementation
  (v) => snip(`bool(${v?.value ?? ''})`, bool),
  'boolCast',
);

/**
 * A schema that represents a boolean value. (equivalent to `bool` in WGSL)
 *
 * @example
 * const value = bool(); // false
 * @example
 * const value = bool(0); // false
 * @example
 * const value = bool(-0); // false
 * @example
 * const value = bool(21.37); // true
 */
export const bool: Bool = Object.assign(boolCast, {
  type: 'bool',
}) as unknown as Bool;

const u32Cast = createDualImpl(
  // CPU implementation
  (v?: number | boolean) => {
    if (v === undefined) {
      return 0;
    }
    if (typeof v === 'boolean') {
      return v ? 1 : 0;
    }
    return (v & 0xffffffff) >>> 0;
  },
  // GPU implementation
  (v) => snip(`u32(${v?.value ?? ''})`, u32),
  'u32Cast',
);

/**
 * A schema that represents an unsigned 32-bit integer value. (equivalent to `u32` in WGSL)
 *
 * @example
 * const value = u32(); // 0
 * @example
 * const value = u32(7); // 7
 * @example
 * const value = u32(3.14); // 3
 * @example
 * const value = u32(-1); // 4294967295
 * @example
 * const value = u32(-3.1); // 0
 */
export const u32: U32 = Object.assign(u32Cast, {
  type: 'u32',
}) as unknown as U32;

const i32Cast = createDualImpl(
  // CPU implementation
  (v?: number | boolean) => {
    if (v === undefined) {
      return 0;
    }
    if (typeof v === 'boolean') {
      return v ? 1 : 0;
    }
    return v | 0;
  },
  // GPU implementation
  (v) => snip(`i32(${v?.value ?? ''})`, i32),
  'i32Cast',
);

export const u16: U16 = {
  [$internal]: true,
  type: 'u16',
} as U16;

/**
 * A schema that represents a signed 32-bit integer value. (equivalent to `i32` in WGSL)
 *
 * @example
 * const value = i32(); // 0
 * @example
 * const value = i32(3.14); // 3
 * @example
 * const value = i32(-3.9); // -3
 * @example
 * const value = i32(10000000000) // 1410065408
 */
export const i32: I32 = Object.assign(i32Cast, {
  type: 'i32',
}) as unknown as I32;

const f32Cast = createDualImpl(
  // CPU implementation
  (v?: number | boolean) => {
    if (v === undefined) {
      return 0;
    }
    if (typeof v === 'boolean') {
      return v ? 1 : 0;
    }
    return Math.fround(v);
  },
  // GPU implementation
  (v) => snip(`f32(${v?.value ?? ''})`, f32),
  'f32Cast',
);

/**
 * A schema that represents a 32-bit float value. (equivalent to `f32` in WGSL)
 *
 * @example
 * const value = f32(); // 0
 * @example
 * const value = f32(1.23); // 1.23
 * @example
 * const value = f32(true); // 1
 */
export const f32: F32 = Object.assign(f32Cast, {
  type: 'f32',
}) as unknown as F32;

// --- f16 helpers for CPU cast ---
const buf32 = new ArrayBuffer(4);
const f32arr = new Float32Array(buf32);
const u32arr = new Uint32Array(buf32);

function toHalfBits(x: number): number {
  f32arr[0] = x;
  const bits = u32arr[0] as number;

  const sign = (bits >>> 31) & 1;
  let exp = (bits >>> 23) & 0xff;
  let mant = bits & 0x7fffff;

  // NaN or ±∞ keep their payload/sign
  if (exp === 0xff) return (sign << 15) | 0x7c00 | (mant ? 0x200 : 0);

  exp = exp - 127 + 15;

  // underflow to zero / subnormals
  if (exp <= 0) {
    if (exp < -10) return sign << 15;
    mant = (mant | 0x800000) >> (1 - exp);
    mant = (mant + 0x1000) >> 13;
    return (sign << 15) | mant;
  }

  // overflow to ±∞
  if (exp >= 0x1f) return (sign << 15) | 0x7c00;

  // normal number –- round mantissa and pack
  mant = mant + 0x1000;
  if (mant & 0x800000) {
    mant = 0;
    ++exp;
    if (exp >= 0x1f) return (sign << 15) | 0x7c00;
  }
  return (sign << 15) | (exp << 10) | (mant >> 13);
}

function fromHalfBits(h: number): number {
  const sign = (h & 0x8000) ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const mant = h & 0x3ff;

  if (exp === 0) return mant ? sign * mant * 2 ** -24 : sign * 0;
  if (exp === 0x1f) {
    return mant
      ? Number.NaN
      : sign === 1
      ? Number.POSITIVE_INFINITY
      : Number.NEGATIVE_INFINITY;
  }
  return sign * (1 + mant / 1024) * 2 ** (exp - 15);
}

function roundToF16(x: number): number {
  return fromHalfBits(toHalfBits(x));
}

const f16Cast = createDualImpl(
  // CPU implementation
  (v?: number | boolean) => {
    if (v === undefined) {
      return 0;
    }
    if (typeof v === 'boolean') {
      return v ? 1 : 0;
    }
    return roundToF16(v);
  },
  // GPU implementation
  // TODO: make usage of f16() in GPU mode check for feature availability and throw if not available
  (v) => snip(`f16(${v?.value ?? ''})`, f16),
  'f16Cast',
);

/**
 * A schema that represents a 16-bit float value. (equivalent to `f16` in WGSL)
 *
 * @example
 * const value = f16(); // 0
 * @example
 * const value = f32(1.23); // 1.23
 * @example
 * const value = f16(true); // 1
 * @example
 * const value = f16(21877.5); // 21877.5
 */
export const f16: F16 = Object.assign(f16Cast, {
  type: 'f16',
}) as unknown as F16;
