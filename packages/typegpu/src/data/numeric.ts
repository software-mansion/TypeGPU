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

export type Vec2u = WgslData<[number, number]>;
export const vec2u: Vec2u = new SimpleWgslData({
  schema: TB.tupleOf([TB.u32, TB.u32]),
  byteAlignment: 8,
  code: 'vec2u',
});

export type Vec2i = WgslData<[number, number]>;
export const vec2i: Vec2i = new SimpleWgslData({
  schema: TB.tupleOf([TB.i32, TB.i32]),
  byteAlignment: 8,
  code: 'vec2i',
});
export type Vec3u = WgslData<[number, number, number]>;
export const vec3u: Vec3u = new SimpleWgslData({
  schema: TB.tupleOf([TB.u32, TB.u32, TB.u32]),
  byteAlignment: 16,
  code: 'vec3u',
});
export type Vec3i = WgslData<[number, number, number]>;
export const vec3i: Vec3i = new SimpleWgslData({
  schema: TB.tupleOf([TB.i32, TB.i32, TB.i32]),
  byteAlignment: 16,
  code: 'vec3i',
});
export type Vec4u = WgslData<[number, number, number, number]>;
export const vec4u: Vec4u = new SimpleWgslData({
  schema: TB.tupleOf([TB.u32, TB.u32, TB.u32, TB.u32]),
  byteAlignment: 16,
  code: 'vec4u',
});
export type Vec4i = WgslData<[number, number, number, number]>;
export const vec4i: Vec4i = new SimpleWgslData({
  schema: TB.tupleOf([TB.i32, TB.i32, TB.i32, TB.i32]),
  byteAlignment: 16,
  code: 'vec4i',
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
