import bin from 'typed-binary';
import { inGPUMode } from '../gpuMode';
import type {
  AbstractFloat,
  AbstractInt,
  Bool,
  F16,
  F32,
  I32,
  U32,
} from './wgslTypes';

export const abstractInt = {
  type: 'abstractInt',
} as AbstractInt;

export const abstractFloat = {
  type: 'abstractFloat',
} as AbstractFloat;

/**
 * A schema that represents a boolean value. (equivalent to `bool` in WGSL)
 */
export const bool: Bool = {
  type: 'bool',
} as Bool;

const u32Cast = (v: number | boolean) => {
  if (inGPUMode()) {
    return `u32(${v})` as unknown as number;
  }

  if (typeof v === 'boolean') {
    return v ? 1 : 0;
  }
  if (Number.isInteger(v)) {
    if (v < 0 || v > 0xffffffff) {
      console.warn(`u32 value ${v} overflowed`);
    }
    const value = v & 0xffffffff;
    return value >>> 0;
  }
  return Math.max(0, Math.min(0xffffffff, Math.floor(v)));
};

/**
 * A schema that represents an unsigned 32-bit integer value. (equivalent to `u32` in WGSL)
 *
 * Can also be called to cast a value to an u32 in accordance with WGSL casting rules.
 *
 * @example
 * const value = u32(3.14); // 3
 * @example
 * const value = u32(-1); // 4294967295
 * @example
 * const value = u32(-3.1); // 0
 */
export const u32: U32 = Object.assign(u32Cast, {
  type: 'u32',
}) as U32;

const i32Cast = (v: number | boolean) => {
  if (inGPUMode()) {
    return `i32(${v})` as unknown as number;
  }

  if (typeof v === 'boolean') {
    return v ? 1 : 0;
  }
  if (Number.isInteger(v)) {
    if (v < -0x80000000 || v > 0x7fffffff) {
      console.warn(`i32 value ${v} overflowed`);
    }
    const value = v | 0;
    return value & 0xffffffff;
  }
  // round towards zero
  const value = v < 0 ? Math.ceil(v) : Math.floor(v);
  return Math.max(-0x80000000, Math.min(0x7fffffff, value));
};

/**
 * A schema that represents a signed 32-bit integer value. (equivalent to `i32` in WGSL)
 *
 * Can also be called to cast a value to an i32 in accordance with WGSL casting rules.
 *
 * @example
 * const value = i32(3.14); // 3
 * @example
 * const value = i32(-3.9); // -3
 * @example
 * const value = i32(10000000000) // 1410065408
 */
export const i32: I32 = Object.assign(i32Cast, {
  type: 'i32',
}) as I32;

const f32Cast = (v: number | boolean) => {
  if (inGPUMode()) {
    return `f32(${v})` as unknown as number;
  }
  if (typeof v === 'boolean') {
    return v ? 1 : 0;
  }
  const arr = new Float32Array(1);
  arr[0] = v;
  return arr[0];
};

/**
 * A schema that represents a 32-bit float value. (equivalent to `f32` in WGSL)
 *
 * Can also be called to cast a value to an f32.
 *
 * @example
 * const value = f32(true); // 1
 */
export const f32: F32 = Object.assign(f32Cast, {
  type: 'f32',
}) as F32;

const f16Cast = (v: number | boolean) => {
  if (inGPUMode()) {
    // TODO: make usage of f16() in GPU mode check for feature availability and throw if not available
    return `f16(${v})` as unknown as number;
  }
  if (typeof v === 'boolean') {
    return v ? 1 : 0;
  }
  const arr = new ArrayBuffer(2);
  bin.f16.write(new bin.BufferWriter(arr), v);
  return bin.f16.read(new bin.BufferReader(arr));
};

/**
 * A schema that represents a 16-bit float value. (equivalent to `f16` in WGSL)
 *
 * Can also be called to cast a value to an f16.
 *
 * @example
 * const value = f16(true); // 1
 * @example
 * const value = f16(21877.5); // 21872
 */
export const f16: F16 = Object.assign(f16Cast, {
  type: 'f16',
}) as F16;
