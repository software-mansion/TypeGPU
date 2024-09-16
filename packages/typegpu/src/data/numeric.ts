import * as TB from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
import type { TgpuData } from '../types';
import alignIO from './alignIO';
import { SimpleTgpuData } from './std140';

const primitiveNumeric = (
  schema: TB.Uint32Schema | TB.Float32Schema | TB.Int32Schema,
  code: string,
) => {
  return {
    __unwrapped: undefined as unknown as number,
    size: 4,
    byteAlignment: 4,
    expressionCode: code,

    write(output: TB.ISerialOutput, value: number): void {
      alignIO(output, 4);
      schema.write(output, value);
    },

    read(input: TB.ISerialInput): number {
      alignIO(input, 4);
      return schema.read(input);
    },

    measure(
      value: number | TB.MaxValue,
      measurer: TB.IMeasurer = new TB.Measurer(),
    ): TB.IMeasurer {
      alignIO(measurer, 4);
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
  } as TgpuData<number>;
};

export type Bool = TgpuData<boolean>;
export const bool: Bool = new SimpleTgpuData({
  schema: TB.bool,
  byteAlignment: 4,
  code: 'bool',
});

export type U32 = TgpuData<number> & ((v: number | boolean) => number);
const u32Cast = (v: number | boolean) => {
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
export const u32: U32 = Object.assign(u32Cast, primitiveNumeric(TB.u32, 'u32'));

export type I32 = TgpuData<number> & ((v: number | boolean) => number);
const i32Cast = (v: number | boolean) => {
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
export const i32: I32 = Object.assign(i32Cast, primitiveNumeric(TB.i32, 'i32'));

export type F32 = TgpuData<number> & ((v: number | boolean) => number);
const f32Cast = (v: number | boolean) => {
  if (typeof v === 'boolean') {
    return v ? 1 : 0;
  }
  return v;
};
export const f32: F32 = Object.assign(f32Cast, primitiveNumeric(TB.f32, 'f32'));
