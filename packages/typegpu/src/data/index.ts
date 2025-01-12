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
  isInterpolateAttrib,
  isSizeAttrib,
} from './wgslTypes';
export type {
  BaseWgslData,
  Bool,
  F32,
  F16,
  I32,
  U32,
  Vec2f,
  Vec2h,
  Vec2i,
  Vec2u,
  Vec3f,
  Vec3h,
  Vec3i,
  Vec3u,
  Vec4f,
  Vec4h,
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
  Disarray,
  Unstruct,
  LooseDecorated,
  AnyData,
  AnyLooseData,
} from './dataTypes';
export {
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
} from './vector';
export { disarrayOf } from './disarray';
export { unstruct } from './unstruct';
export {
  mat2x2f,
  mat3x3f,
  mat4x4f,
  matToArray,
} from './matrix';
export * from './vertexFormatData';
export { atomic } from './atomic';
export {
  align,
  size,
  location,
  interpolate,
  isBuiltin,
  AnyAttribute,
  IsBuiltin,
  HasCustomLocation,
} from './attributes';
export {
  isDisarray,
  isUnstruct,
  isLooseDecorated,
  isData,
  isLooseData,
} from './dataTypes';
export { PUBLIC_sizeOf as sizeOf } from './sizeOf';
export { PUBLIC_alignmentOf as alignmentOf } from './alignmentOf';
export {
  builtin,
  BuiltinVertexIndex,
  BuiltinInstanceIndex,
  BuiltinPosition,
  BuiltinClipDistances,
  BuiltinFrontFacing,
  BuiltinFragDepth,
  BuiltinSampleIndex,
  BuiltinSampleMask,
  BuiltinFragment,
  BuiltinLocalInvocationId,
  BuiltinLocalInvocationIndex,
  BuiltinGlobalInvocationId,
  BuiltinWorkgroupId,
  BuiltinNumWorkgroups,
  AnyBuiltin,
} from '../builtin';

import type { Infer as INTERNAL_Infer } from '../shared/repr';
import type { Exotic } from './exotic';

/**
 * Extracts the inferred representation of a resource.
 * @example
 * type A = Infer<F32> // => number
 * type B = Infer<TgpuArray<F32>> // => number[]
 */
export type Infer<T> = INTERNAL_Infer<Exotic<T>>;
