import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { bitcastU32toF32Impl, bitcastU32toI32Impl } from '../data/numberOps.ts';
import { f32, i32, u32 } from '../data/numeric.ts';
import { VectorOps } from '../data/vectorOps.ts';
import type {
  v2f,
  v2i,
  v2u,
  v3f,
  v3i,
  v3u,
  v4f,
  v4i,
  v4u,
} from '../data/wgslTypes.ts';

export type BitcastU32toF32Overload =
  & ((value: number) => number)
  & ((value: v2u) => v2f)
  & ((value: v3u) => v3f)
  & ((value: v4u) => v4f);

export const bitcastU32toF32 = dualImpl({
  name: 'bitcastU32toF32',
  normalImpl: ((value) => {
    if (typeof value === 'number') {
      return bitcastU32toF32Impl(value);
    }
    return VectorOps.bitcastU32toF32[value.kind](value);
  }) as BitcastU32toF32Overload,
  codegenImpl: (n) => stitch`bitcast<f32>(${n})`,
  signature: { argTypes: [u32], returnType: f32 },
});

export type BitcastU32toI32Overload =
  & ((value: number) => number)
  & ((value: v2u) => v2i)
  & ((value: v3u) => v3i)
  & ((value: v4u) => v4i);

export const bitcastU32toI32 = dualImpl({
  name: 'bitcastU32toI32',
  normalImpl: ((value) => {
    if (typeof value === 'number') {
      return bitcastU32toI32Impl(value);
    }
    return VectorOps.bitcastU32toI32[value.kind](value);
  }) as BitcastU32toI32Overload,
  codegenImpl: (n) => stitch`bitcast<i32>(${n})`,
  signature: { argTypes: [u32], returnType: i32 },
});

export function checkEndian() {
  const arrayBuffer = new ArrayBuffer(2);
  const uint8Array = new Uint8Array(arrayBuffer);
  const uint16array = new Uint16Array(arrayBuffer);
  uint8Array[0] = 0xAA;
  uint8Array[1] = 0xBB;
  if (uint16array[0] === 0xBBAA) return 'little endian';
  if (uint16array[0] === 0xAABB) return 'big endian';
  throw new Error('Something crazy just happened');
}
