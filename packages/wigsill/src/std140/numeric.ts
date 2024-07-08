import * as TB from 'typed-binary';
import { SimpleWGSLDataType } from './std140';

export const bool = new SimpleWGSLDataType({
  schema: TB.bool,
  byteAlignment: 4,
  code: 'bool',
});
export const u32 = new SimpleWGSLDataType({
  schema: TB.u32,
  byteAlignment: 4,
  code: 'u32',
});
export const i32 = new SimpleWGSLDataType({
  schema: TB.i32,
  byteAlignment: 4,
  code: 'i32',
});
export const f32 = new SimpleWGSLDataType({
  schema: TB.f32,
  byteAlignment: 4,
  code: 'f32',
});

export const vec2u = new SimpleWGSLDataType({
  schema: TB.tupleOf([TB.u32, TB.u32]),
  byteAlignment: 8,
  code: 'vec2u',
});

export const vec2i = new SimpleWGSLDataType({
  schema: TB.tupleOf([TB.i32, TB.i32]),
  byteAlignment: 8,
  code: 'vec2i',
});
export const vec2f = new SimpleWGSLDataType({
  schema: TB.tupleOf([TB.f32, TB.f32]),
  byteAlignment: 8,
  code: 'vec2f',
});
export const vec3u = new SimpleWGSLDataType({
  schema: TB.tupleOf([TB.u32, TB.u32, TB.u32]),
  byteAlignment: 16,
  code: 'vec3u',
});
export const vec3i = new SimpleWGSLDataType({
  schema: TB.tupleOf([TB.i32, TB.i32, TB.i32]),
  byteAlignment: 16,
  code: 'vec3i',
});
export const vec3f = new SimpleWGSLDataType({
  schema: TB.tupleOf([TB.f32, TB.f32, TB.f32]),
  byteAlignment: 16,
  code: 'vec3f',
});
export const vec4u = new SimpleWGSLDataType({
  schema: TB.tupleOf([TB.u32, TB.u32, TB.u32, TB.u32]),
  byteAlignment: 16,
  code: 'vec4u',
});
export const vec4i = new SimpleWGSLDataType({
  schema: TB.tupleOf([TB.i32, TB.i32, TB.i32, TB.i32]),
  byteAlignment: 16,
  code: 'vec4i',
});
export const vec4f = new SimpleWGSLDataType({
  schema: TB.tupleOf([TB.f32, TB.f32, TB.f32, TB.f32]),
  byteAlignment: 16,
  code: 'vec4f',
});

/**
 * Array of column vectors
 */
export const mat4f = new SimpleWGSLDataType({
  schema: TB.arrayOf(TB.f32, 16),
  byteAlignment: 16,
  code: 'mat4x4f',
});
