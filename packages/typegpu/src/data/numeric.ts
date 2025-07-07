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
 * Can also be called to cast a value to a bool in accordance with WGSL casting rules.
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
 * Can also be called to cast a value to an u32 in accordance with WGSL casting rules.
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
 * Can also be called to cast a value to an i32 in accordance with WGSL casting rules.
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
 * Can also be called to cast a value to an f32.
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

// helpers for floating point conversion
const buf32 = new ArrayBuffer(4);
const f32arr = new Float32Array(buf32);
const u32arr = new Uint32Array(buf32);

/**
 * Convert a JavaScript number (treated as float32) to **binary16** bit pattern.
 * @param x 32-bit floating-point value
 * @returns 16-bit half-precision encoding (stored in a JS number)
 */
export function toHalfBits(x: number): number {
  f32arr[0] = x; // Write value; shared buffer now contains raw bits.
  const bits = u32arr[0] as number; // Read those bits as unsigned int.

  // 1. Extract sign, exponent, and mantissa from the 32‑bit layout.
  const sign = (bits >>> 31) & 0x1; // Bit 31 is the sign.
  let exp = (bits >>> 23) & 0xff; // Bits 30‑23 form the biased exponent.
  let mant = bits & 0x7fffff; // Bits 22‑0 are the significand.

  // 2. Handle special values (NaN, ±∞) before re‑biasing.
  if (exp === 0xff) {
    // Preserve the quiet‑NaN bit if mant≠0; otherwise this is ±∞.
    return (sign << 15) | 0x7c00 | (mant ? 0x0200 : 0);
  }

  // 3. Re‑bias the exponent from 127 → 15 (binary32 → binary16).
  exp = exp - 127 + 15;

  // 4. Underflow: exponent ≤ 0 yields sub‑normals or signed zero.
  if (exp <= 0) {
    // If we need to shift more than 10 places, the value rounds to ±0.
    if (exp < -10) {
      return sign << 15;
    }

    // Produce a sub‑normal: prepend the hidden 1, right‑shift, then round.
    mant = (mant | 0x800000) >> (1 - exp);
    mant = (mant + 0x1000) >> 13; // Round‑to‑nearest‑even at bit 10.
    return (sign << 15) | mant;
  }

  // 5. Overflow: if the biased exponent is 31 (0x1f) or higher, the number
  //    cannot be represented in half precision, so we return ±∞.
  if (exp >= 0x1f) {
    return (sign << 15) | 0x7c00; // ±∞
  }

  // 6. Normalised number: round mantissa and pack sign|exp|mant.
  mant = mant + 0x1000; // Add rounding bias at bit 12.
  if (mant & 0x800000) { // The carry propagated out of the top bit; mantissa overflowed.
    mant = 0; // Rounded up to 1.0 × 2^(exp+1).
    ++exp; // Increment exponent (may overflow to ±∞).
    if (exp >= 0x1f) {
      return (sign << 15) | 0x7c00;
    }
  }

  return (sign << 15) | (exp << 10) | (mant >> 13);
}

/**
 * Convert a **binary16** encoded bit pattern back to JavaScript number.
 * @param h 16-bit half-precision bits
 * @returns JavaScript number (64-bit float) with same numerical value
 */
export function fromHalfBits(h: number): number {
  const sign = (h & 0x8000) ? -1 : 1; // Sign multiplier (preserves −0).
  const exp = (h >> 10) & 0x1f; // 5‑bit exponent.
  const mant = h & 0x03ff; // 10‑bit significand.

  // 1. Zero and sub‑normals.
  if (exp === 0) {
    return mant ? sign * mant * 2 ** -24 : sign * 0;
  }

  // 2. Special cases (exp == 31).
  if (exp === 0x1f) {
    return mant
      ? Number.NaN
      : (sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
  }

  // 3. Normalised numbers.
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
 * Can also be called to cast a value to an f16.
 *
 * @example
 * const value = f16(); // 0
 * @example
 * const value = f32(1.23); // 1.23
 * @example
 * const value = f16(true); // 1
 * @example
 * const value = f16(21877.5); // 21872
 */
export const f16: F16 = Object.assign(f16Cast, {
  type: 'f16',
}) as unknown as F16;
