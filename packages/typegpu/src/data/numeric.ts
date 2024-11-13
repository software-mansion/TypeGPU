import bin from 'typed-binary';
import type * as TB from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
import { inGPUMode } from '../gpuMode';
import type { TgpuData } from '../types';
import { SimpleTgpuData } from './std140';

const primitiveNumeric = <TKind extends string>(
  schema:
    | TB.Uint32Schema
    | TB.Float32Schema
    | TB.Int32Schema
    | TB.Float16Schema,
  code: TKind,
  size = 4,
  byteAlignment = 4,
) => {
  return {
    // Type-token, not available at runtime
    __unwrapped: undefined as unknown as number,

    isLoose: false as const,
    kind: code,
    size,
    byteAlignment,
    expressionCode: code,

    write(output: TB.ISerialOutput, value: number): void {
      schema.write(output, value);
    },

    read(input: TB.ISerialInput): number {
      return schema.read(input);
    },

    measure(
      value: number | TB.MaxValue,
      measurer: TB.IMeasurer = new bin.Measurer(),
    ): TB.IMeasurer {
      schema.measure(value, measurer);
      return measurer;
    },

    resolveReferences(ctx: TB.IRefResolver): void {
      throw new RecursiveDataTypeError();
    },

    seekProperty(
      reference: number | TB.MaxValue,
      prop: never,
    ): { bufferOffset: number; schema: TB.ISchema<unknown> } | null {
      throw new Error('Method not implemented.');
    },

    resolve(): string {
      return code;
    },

    toString(): string {
      return code;
    },
  };
};

/**
 * Boolean schema representing a single WGSL bool value.
 * Cannot be used inside buffers as it is not host-shareable.
 */
export type Bool = TgpuData<boolean>;
/**
 * A schema that represents a boolean value. (equivalent to `bool` in WGSL)
 */
export const bool: Bool = new SimpleTgpuData({
  schema: bin.bool,
  byteAlignment: 4,
  code: 'bool',
});

/**
 * Unsigned 32-bit integer schema representing a single WGSL u32 value.
 */
export type U32 = TgpuData<number> & { kind: 'u32' } & ((
    v: number | boolean,
  ) => number);
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
export const u32: U32 = Object.assign(
  u32Cast,
  primitiveNumeric(bin.u32, 'u32'),
);

/**
 * Signed 32-bit integer schema representing a single WGSL i32 value.
 */
export type I32 = TgpuData<number> & { kind: 'i32' } & ((
    v: number | boolean,
  ) => number);
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
export const i32: I32 = Object.assign(
  i32Cast,
  primitiveNumeric(bin.i32, 'i32'),
);

/**
 * 32-bit float schema representing a single WGSL f32 value.
 */
export type F32 = TgpuData<number> & { kind: 'f32' } & ((
    v: number | boolean,
  ) => number);
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
export const f32: F32 = Object.assign(
  f32Cast,
  primitiveNumeric(bin.f32, 'f32'),
);

export type F16 = TgpuData<number> & { kind: 'f16' } & ((
    v: number | boolean,
  ) => number);
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
export const f16: F16 = Object.assign(
  f16Cast,
  primitiveNumeric(bin.f16, 'f16', 2, 2),
);
