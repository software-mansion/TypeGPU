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
    return v;
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

const f16Cast = createDualImpl(
  // CPU implementation
  (v?: number | boolean) => {
    if (v === undefined) {
      return 0;
    }
    if (typeof v === 'boolean') {
      return v ? 1 : 0;
    }
    return v;
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
