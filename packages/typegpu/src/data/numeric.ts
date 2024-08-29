import * as TB from 'typed-binary';
import type { WgslData } from '../types';
import { SimpleWgslData } from './std140';

export type Bool = WgslData<boolean>;
export const bool: Bool = new SimpleWgslData({
  schema: TB.bool,
  byteAlignment: 4,
  code: 'bool',
});
export type U32 = WgslData<number>;
export const u32: U32 = new SimpleWgslData({
  schema: TB.u32,
  byteAlignment: 4,
  code: 'u32',
});
export type I32 = WgslData<number>;
export const i32: I32 = new SimpleWgslData({
  schema: TB.i32,
  byteAlignment: 4,
  code: 'i32',
});
export type F32 = WgslData<number>;
export const f32: F32 = new SimpleWgslData({
  schema: TB.f32,
  byteAlignment: 4,
  code: 'f32',
});

/**
 * Array of column vectors
 */
export type Mat4f = WgslData<number[]>;
export const mat4f: Mat4f = new SimpleWgslData({
  schema: TB.arrayOf(TB.f32, 16),
  byteAlignment: 16,
  code: 'mat4x4f',
});
