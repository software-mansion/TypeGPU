/**
 * @module typegpu/data
 */

export { bool, f32, i32, u32 } from './numeric';
export type {
  WgslStruct,
  WgslArray,
  Decorated,
  Size,
  Align,
  Builtin,
  Location,
  AnyWgslData,
} from './wgslTypes';
export {
  TgpuStruct,
  struct,
} from './struct';
export {
  TgpuArray,
  arrayOf,
} from './array';
export type {
  Bool,
  F32,
  I32,
  U32,
  Vec2f,
  Vec2i,
  Vec2u,
  Vec3f,
  Vec3i,
  Vec3u,
  Vec4f,
  Vec4i,
  Vec4u,
  LooseArray,
  LooseStruct,
  AnyData,
  AnyLooseData,
} from './dataTypes';
export type { LooseDecorated } from './attributes';
export {
  vec2f,
  vec2i,
  vec2u,
  vec3f,
  vec3i,
  vec3u,
  vec4f,
  vec4i,
  vec4u,
} from './vector';
export { looseArrayOf, isLooseArray } from './looseArray';
export { looseStruct, isLooseStructSchema } from './looseStruct';
export { mat2x2f, mat3x3f, mat4x4f } from './matrix';
export * from './vertexFormatData';
export { atomic, isAtomicSchema } from './atomic';
export {
  align,
  size,
  location,
  isDecorated,
  isLooseDecorated,
  isBuiltin,
  BaseDecorated,
  AnyAttribute,
  IsBuiltin,
} from './attributes';

// Oh TypeScript...
import type {
  mat2x2f as mat2x2fType,
  mat3x3f as mat3x3fType,
  mat4x4f as mat4x4fType,
} from './wgslTypes';
export type mat2x2f = mat2x2fType;
export type mat3x3f = mat3x3fType;
export type mat4x4f = mat4x4fType;
