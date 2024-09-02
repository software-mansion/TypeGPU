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

export type Vec2u = TgpuData<[number, number]>;
export const vec2u: Vec2u = new SimpleTgpuData({
  schema: TB.tupleOf([TB.u32, TB.u32]),
  byteAlignment: 8,
  code: 'vec2u',
});

export type Vec2i = TgpuData<[number, number]>;
export const vec2i: Vec2i = new SimpleTgpuData({
  schema: TB.tupleOf([TB.i32, TB.i32]),
  byteAlignment: 8,
  code: 'vec2i',
});
export type Vec2f = TgpuData<[number, number]>;
export const vec2f: Vec2f = new SimpleTgpuData({
  schema: TB.tupleOf([TB.f32, TB.f32]),
  byteAlignment: 8,
  code: 'vec2f',
});
export type Vec3u = TgpuData<[number, number, number]>;
export const vec3u: Vec3u = new SimpleTgpuData({
  schema: TB.tupleOf([TB.u32, TB.u32, TB.u32]),
  byteAlignment: 16,
  code: 'vec3u',
});
export type Vec3i = TgpuData<[number, number, number]>;
export const vec3i: Vec3i = new SimpleTgpuData({
  schema: TB.tupleOf([TB.i32, TB.i32, TB.i32]),
  byteAlignment: 16,
  code: 'vec3i',
});
export type Vec3f = TgpuData<[number, number, number]>;
export const vec3f: Vec3f = new SimpleTgpuData({
  schema: TB.tupleOf([TB.f32, TB.f32, TB.f32]),
  byteAlignment: 16,
  code: 'vec3f',
});
export type Vec4u = TgpuData<[number, number, number, number]>;
export const vec4u: Vec4u = new SimpleTgpuData({
  schema: TB.tupleOf([TB.u32, TB.u32, TB.u32, TB.u32]),
  byteAlignment: 16,
  code: 'vec4u',
});
export type Vec4i = TgpuData<[number, number, number, number]>;
export const vec4i: Vec4i = new SimpleTgpuData({
  schema: TB.tupleOf([TB.i32, TB.i32, TB.i32, TB.i32]),
  byteAlignment: 16,
  code: 'vec4i',
});
export type Vec4f = TgpuData<[number, number, number, number]>;
export const vec4f: Vec4f = new SimpleTgpuData({
  schema: TB.tupleOf([TB.f32, TB.f32, TB.f32, TB.f32]),
  byteAlignment: 16,
  code: 'vec4f',
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
