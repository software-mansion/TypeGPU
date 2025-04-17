/**
 * @module typegpu/data
 */

export {
  bool,
  f32,
  f16,
  i32,
  u32,
} from './numeric.ts';
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
} from './wgslTypes.ts';
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
  Vec2b,
  Vec3f,
  Vec3h,
  Vec3i,
  Vec3u,
  Vec3b,
  Vec4f,
  Vec4h,
  Vec4i,
  Vec4u,
  Vec4b,
  Mat2x2f,
  Mat3x3f,
  Mat4x4f,
  WgslArray,
  WgslStruct,
  AnyWgslStruct,
  Ptr,
  Atomic,
  Decorated,
  Size,
  Align,
  Builtin,
  Location,
  Interpolate,
  AnyWgslData,
  AnyVecInstance,
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
} from './wgslTypes.ts';
export { struct } from './struct.ts';
export { arrayOf } from './array.ts';
export {
  ptrFn,
  ptrPrivate,
  ptrHandle,
  ptrStorage,
  ptrUniform,
  ptrWorkgroup,
} from './ptr.ts';
export type {
  Disarray,
  Unstruct,
  LooseDecorated,
  AnyData,
  AnyLooseData,
} from './dataTypes.ts';
export {
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec2b,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec3b,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
  vec4b,
} from './vector.ts';
export { disarrayOf } from './disarray.ts';
export { unstruct } from './unstruct.ts';
export {
  mat2x2f,
  mat3x3f,
  mat4x4f,
  matToArray,
} from './matrix.ts';
export * from './vertexFormatData.ts';
export { atomic } from './atomic.ts';
export {
  align,
  size,
  location,
  interpolate,
  isBuiltin,
  type AnyAttribute,
  type IsBuiltin,
  type HasCustomLocation,
} from './attributes.ts';
export {
  isDisarray,
  isUnstruct,
  isLooseDecorated,
  isData,
  isLooseData,
} from './dataTypes.ts';
export { PUBLIC_sizeOf as sizeOf } from './sizeOf.ts';
export { PUBLIC_alignmentOf as alignmentOf } from './alignmentOf.ts';
export { builtin } from '../builtin.ts';
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
} from '../builtin.ts';
export type { Infer } from '../shared/repr.ts';
