/**
 * @module typegpu/data
 */

export {
  bool,
  f32,
  f16,
  i32,
  u32,
} from './numeric';
export {
  isWgslData,
  isWgslArray,
  isWgslStruct,
  isPtr,
  isAtomic,
  isDecorated,
  isAlignAttrib,
  isBuiltinAttrib,
  isLocationAttrib,
  isInterpolateAttrib,
  isSizeAttrib,
} from './wgslTypes';
export type {
  BaseData,
  BaseData as BaseWgslData,
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
  WgslArray,
  WgslStruct,
  Ptr,
  Atomic,
  Decorated,
  Size,
  Align,
  Builtin,
  Location,
  Interpolate,
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
export { struct } from './struct';
export { arrayOf } from './array';
export {
  ptrFn,
  ptrPrivate,
  ptrHandle,
  ptrStorage,
  ptrUniform,
  ptrWorkgroup,
} from './ptr';
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
  type AnyAttribute,
  type IsBuiltin,
  type HasCustomLocation,
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
export { builtin } from '../builtin';
export type {
  BuiltinVertexIndex,
  BuiltinInstanceIndex,
  BuiltinPosition,
  BuiltinClipDistances,
  BuiltinFrontFacing,
  BuiltinFragDepth,
  BuiltinSampleIndex,
  BuiltinSampleMask,
  BuiltinLocalInvocationId,
  BuiltinLocalInvocationIndex,
  BuiltinGlobalInvocationId,
  BuiltinWorkgroupId,
  BuiltinNumWorkgroups,
  AnyBuiltin,
} from '../builtin';
export type { Infer } from '../shared/repr';
