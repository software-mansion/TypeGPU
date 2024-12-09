/**
 * @module typegpu/data
 */

export { bool, f32, f16, i32, u32 } from './numeric';
export {
  isWgslData,
  isWgslArray,
  isWgslStruct,
  isAtomic,
  isDecorated,
  isAlignAttrib,
  isBuiltinAttrib,
  isLocationAttrib,
  isSizeAttrib,
} from './wgslTypes';
export type {
  Bool,
  F32,
  F16,
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
  Mat2x2f,
  Mat3x3f,
  Mat4x4f,
  WgslStruct,
  WgslArray,
  Atomic,
  Decorated,
  Size,
  Align,
  Builtin,
  Location,
  AnyWgslData,
  v2f,
  v2i,
  v2u,
  v3f,
  v3i,
  v3u,
  v4f,
  v4i,
  v4u,
  m2x2f,
  m3x3f,
  m4x4f,
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
  LooseArray,
  LooseStruct,
  LooseDecorated,
  AnyData,
  AnyLooseData,
} from './dataTypes';
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
export { looseArrayOf } from './looseArray';
export { looseStruct } from './looseStruct';
export {
  mat2x2f,
  mat3x3f,
  mat4x4f,
  matToArray,
} from './matrix';
export * from './vertexFormatData';
export { atomic } from './atomic';
export type { Infer } from '../shared/repr';
export {
  align,
  size,
  location,
  isBuiltin,
  AnyAttribute,
  IsBuiltin,
} from './attributes';
export {
  isLooseArray,
  isLooseStruct,
  isLooseDecorated,
  isData,
  isLooseData,
} from './dataTypes';
export { PUBLIC_sizeOf as sizeOf } from './sizeOf';
export { PUBLIC_alignmentOf as alignmentOf } from './alignmentOf';
