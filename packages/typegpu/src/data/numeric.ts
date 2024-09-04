import * as TB from 'typed-binary';
import type { TgpuData } from '../types';
import { SimpleTgpuData } from './std140';

export type Bool = TgpuData<boolean>;
export const bool: Bool = new SimpleTgpuData({
  schema: TB.bool,
  byteAlignment: 4,
  code: 'bool',
});
export type U32 = TgpuData<number>;
export const u32: U32 = new SimpleTgpuData({
  schema: TB.u32,
  byteAlignment: 4,
  code: 'u32',
});
export type I32 = TgpuData<number>;
export const i32: I32 = new SimpleTgpuData({
  schema: TB.i32,
  byteAlignment: 4,
  code: 'i32',
});
export type F32 = TgpuData<number>;
export const f32: F32 = new SimpleTgpuData({
  schema: TB.f32,
  byteAlignment: 4,
  code: 'f32',
});

/**
 * Array of column vectors
 */
export type Mat4f = TgpuData<number[]>;
export const mat4f: Mat4f = new SimpleTgpuData({
  schema: TB.arrayOf(TB.f32, 16),
  byteAlignment: 16,
  code: 'mat4x4f',
});
