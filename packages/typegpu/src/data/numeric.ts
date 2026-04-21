import { $internal } from '../shared/symbols.ts';
import type { AbstractFloat, AbstractInt, Bool, F16, F32, I32, U16, U32 } from './wgslTypes.ts';
import { callableSchema } from '../core/function/createCallableSchema.ts';
export const abstractInt = {
  [$internal]: {},
  type: 'abstractInt',
  toString() {
    return 'abstractInt';
  },
} as AbstractInt;

export const abstractFloat = {
  [$internal]: {},
  type: 'abstractFloat',
  toString() {
    return 'abstractFloat';
  },
} as AbstractFloat;
import { f16Cast, f32Cast } from './schemaCallWrapper.ts';

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
export const bool: Bool = Object.assign(
  callableSchema({
    name: 'bool',
    schema: () => bool,
    argTypes: (arg) => (arg ? [arg] : []),
    normalImpl(v?: number | boolean) {
      if (v === undefined) {
        return false;
      }
      if (typeof v === 'boolean') {
        return v;
      }
      return !!v;
    },
    codegenImpl: (ctx, args) => ctx.gen.typeInstantiation(bool, args),
  }),
  {
    [$internal]: {},
    type: 'bool',
  },
) as unknown as Bool;

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
export const u32: U32 = Object.assign(
  callableSchema({
    name: 'u32',
    schema: () => u32,
    argTypes: (arg) => (arg ? [arg] : []),
    normalImpl(v?: number | boolean) {
      if (v === undefined) {
        return 0;
      }
      if (typeof v === 'boolean') {
        return v ? 1 : 0;
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
    },
    codegenImpl: (ctx, args) => ctx.gen.typeInstantiation(u32, args),
  }),
  {
    [$internal]: {},
    type: 'u32',
  },
) as unknown as U32;

export const u16: U16 = {
  [$internal]: {},
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
export const i32: I32 = Object.assign(
  callableSchema({
    name: 'i32',
    schema: () => i32,
    argTypes: (arg) => (arg ? [arg] : []),
    normalImpl(v?: number | boolean) {
      if (v === undefined) {
        return 0;
      }
      if (typeof v === 'boolean') {
        return v ? 1 : 0;
      }
      return v | 0;
    },
    codegenImpl: (ctx, args) => ctx.gen.typeInstantiation(i32, args),
  }),
  {
    [$internal]: {},
    type: 'i32',
  },
) as unknown as I32;

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
export const f32: F32 = Object.assign(
  callableSchema({
    name: 'f32',
    schema: () => f32,
    argTypes: (arg) => (arg ? [arg] : []),
    normalImpl(v?: number | boolean) {
      return f32Cast(v);
    },
    codegenImpl: (ctx, args) => ctx.gen.typeInstantiation(f32, args),
  }),
  {
    [$internal]: {},
    type: 'f32',
  },
) as unknown as F32;

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
export const f16: F16 = Object.assign(
  callableSchema({
    name: 'f16',
    schema: () => f16,
    argTypes: (arg) => (arg ? [arg] : []),
    normalImpl(v?: number | boolean) {
      return f16Cast(v);
    },
    // TODO: make usage of f16() in GPU mode check for feature availability and throw if not available
    codegenImpl: (ctx, args) => ctx.gen.typeInstantiation('f16', args),
  }),
  {
    [$internal]: {},
    type: 'f16',
  },
) as unknown as F16;
