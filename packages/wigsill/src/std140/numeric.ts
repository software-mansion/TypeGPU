import {
  arrayOf,
  bool as tbBool,
  f32 as tbF32,
  i32 as tbI32,
  u32 as tbU32,
  tupleOf,
} from 'typed-binary';
import { SimpleWGSLDataType } from './std140';

export const bool = new SimpleWGSLDataType({
  schema: tbBool,
  byteAlignment: 4,
  code: 'bool',
});
export const u32 = new SimpleWGSLDataType({
  schema: tbU32,
  byteAlignment: 4,
  code: 'u32',
});
export const i32 = new SimpleWGSLDataType({
  schema: tbI32,
  byteAlignment: 4,
  code: 'i32',
});
export const f32 = new SimpleWGSLDataType({
  schema: tbF32,
  byteAlignment: 4,
  code: 'f32',
});

export const vec2u = new SimpleWGSLDataType({
  schema: tupleOf([u32, u32]),
  byteAlignment: 8,
  code: 'vec2u',
});

export const vec2i = new SimpleWGSLDataType({
  schema: tupleOf([i32, i32]),
  byteAlignment: 8,
  code: 'vec2i',
});
export const vec2f = new SimpleWGSLDataType({
  schema: tupleOf([f32, f32]),
  byteAlignment: 8,
  code: 'vec2f',
});
export const vec3u = new SimpleWGSLDataType({
  schema: tupleOf([u32, u32, u32]),
  byteAlignment: 16,
  code: 'vec3u',
});
export const vec3i = new SimpleWGSLDataType({
  schema: tupleOf([i32, i32, i32]),
  byteAlignment: 16,
  code: 'vec3i',
});
export const vec3f = new SimpleWGSLDataType({
  schema: tupleOf([f32, f32, f32]),
  byteAlignment: 16,
  code: 'vec3f',
});
export const vec4u = new SimpleWGSLDataType({
  schema: tupleOf([u32, u32, u32, u32]),
  byteAlignment: 16,
  code: 'vec4u',
});
export const vec4i = new SimpleWGSLDataType({
  schema: tupleOf([i32, i32, i32, i32]),
  byteAlignment: 16,
  code: 'vec4i',
});
export const vec4f = new SimpleWGSLDataType({
  schema: tupleOf([f32, f32, f32, f32]),
  byteAlignment: 16,
  code: 'vec4f',
});

/**
 * Array of column vectors
 */
export const mat4f = new SimpleWGSLDataType({
  schema: arrayOf(f32, 16),
  byteAlignment: 16,
  code: 'mat4x4f',
});
