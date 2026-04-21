import { $cast, $gpuCallable } from '../shared/symbols.ts';
import { type GPUCallable, hasCast, isGPUCallable, type ResolutionCtx } from '../types.ts';
import type { Snippet, SnippetType } from './snippet.ts';

export function boolCast(v: unknown): boolean {
  if (v === undefined) {
    // Empty constructor
    return false;
  }
  return !!v;
}

export function f32Cast(v: unknown): number {
  if (v === undefined) {
    // Empty constructor
    return 0;
  }
  if (typeof v === 'boolean') {
    return v ? 1 : 0;
  }
  if (typeof v !== 'number') {
    throw new Error(`Cannot cast ${String(v)} to f32`);
  }
  return Math.fround(v);
}

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
  if (mant & 0x800000) {
    // The carry propagated out of the top bit; mantissa overflowed.
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
  const sign = h & 0x8000 ? -1 : 1; // Sign multiplier (preserves −0).
  const exp = (h >> 10) & 0x1f; // 5‑bit exponent.
  const mant = h & 0x03ff; // 10‑bit significand.

  // 1. Zero and sub‑normals.
  if (exp === 0) {
    // oxlint-disable-next-line oxc/erasing-op -- negative zero exists
    return mant ? sign * mant * 2 ** -24 : sign * 0;
  }

  // 2. Special cases (exp == 31).
  if (exp === 0x1f) {
    return mant ? Number.NaN : sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }

  // 3. Normalised numbers.
  return sign * (1 + mant / 1024) * 2 ** (exp - 15);
}

export function roundToF16(x: number): number {
  return fromHalfBits(toHalfBits(x));
}

export function f16Cast(v: unknown): number {
  if (v === undefined) {
    // Empty constructor
    return 0;
  }
  if (typeof v === 'boolean') {
    return v ? 1 : 0;
  }
  if (typeof v !== 'number') {
    throw new Error(`Cannot cast ${String(v)} to f16`);
  }
  return roundToF16(v);
}

export function i32Cast(v: unknown): number {
  if (v === undefined) {
    // Empty constructor
    return 0;
  }
  if (typeof v === 'boolean') {
    return v ? 1 : 0;
  }
  if (typeof v !== 'number') {
    throw new Error(`Cannot cast ${String(v)} to i32`);
  }

  return v | 0;
}

export function u32Cast(v: unknown): number {
  if (v === undefined) {
    // Empty constructor
    return 0;
  }
  if (typeof v === 'boolean') {
    return v ? 1 : 0;
  }
  if (typeof v !== 'number') {
    throw new Error(`Cannot cast ${String(v)} to u32`);
  }
  if (!Number.isInteger(v)) {
    const truncated = Math.trunc(v);
    if (truncated < 0) {
      return 0;
    }
    if (truncated > 0xffffffff) {
      return 0xffffffff;
    }
    return truncated;
  }
  // Integer input: treat as bit reinterpretation (i32 -> u32)
  return (v & 0xffffffff) >>> 0;
}

/**
 * A wrapper for `schema(item)` or `schema()` call on JS side.
 * If the schema is a pointer, returns the value pointed to without copying.
 * If the schema is a TgpuVertexFormatData, calls the corresponding constructible schema instead.
 * If the schema is not callable, throws an error.
 * Otherwise, returns `schema(item)` or `schema()`.
 */
export function schemaCallWrapper<T>(schema: SnippetType, item?: T): T {
  if (schema === 'bool') {
    return boolCast(item) as T;
  }
  if (schema === 'f32') {
    return f32Cast(item) as T;
  }
  if (schema === 'f16') {
    return f16Cast(item) as T;
  }
  if (schema === 'i32') {
    return i32Cast(item) as T;
  }
  if (schema === 'u32') {
    return u32Cast(item) as T;
  }

  const callSchema = schema as unknown as (item?: T) => T;

  if (hasCast(callSchema)) {
    return callSchema[$cast](item) as T;
  }

  if (typeof callSchema !== 'function') {
    // Not callable
    return item as T;
  }

  return item === undefined ? callSchema() : callSchema(item);
}

/**
 * A wrapper for `schema(item)` or `schema()` call on the GPU side.
 * If the schema is a pointer, returns the value pointed to without copying.
 * If the schema is a TgpuVertexFormatData, calls the corresponding constructible schema instead.
 * If the schema is not callable, throws an error.
 * Otherwise, returns `schema(item)` or `schema()`.
 */
export function schemaCallWrapperGPU(
  ctx: ResolutionCtx,
  schema: SnippetType,
  item?: Snippet,
): Snippet {
  if (typeof schema === 'string') {
    return ctx.gen.typeInstantiation(schema, item ? [item] : []);
  }

  if (!isGPUCallable(schema)) {
    // Not callable
    return item as Snippet;
  }

  const callSchema = schema as GPUCallable<[unknown?]>;
  return item === undefined || item.value === undefined
    ? callSchema[$gpuCallable].call(ctx, [])
    : callSchema[$gpuCallable].call(ctx, [item]);
}
