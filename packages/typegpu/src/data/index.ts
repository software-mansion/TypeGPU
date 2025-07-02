/**
 * @module typegpu/data
 */

export { bool, f16, f32, i32, u16, u32 } from './numeric.ts';
export {
  isAlignAttrib,
  isAtomic,
  isBuiltinAttrib,
  isDecorated,
  isInterpolateAttrib,
  isLocationAttrib,
  isPtr,
  isSizeAttrib,
  isWgslArray,
  isWgslData,
  isWgslStruct,
  Void,
} from './wgslTypes.ts';
export type {
  Align,
  AnyVecInstance,
  AnyWgslData,
  AnyWgslStruct,
  Atomic,
  BaseData,
  BaseData as BaseWgslData,
  Bool,
  Builtin,
  Decorated,
  F16,
  F32,
  I32,
  Interpolate,
  Location,
  m2x2f,
  m3x3f,
  m4x4f,
  Mat2x2f,
  Mat3x3f,
  Mat4x4f,
  Ptr,
  Size,
  U16,
  U32,
  v2b,
  v2f,
  v2i,
  v2u,
  v3b,
  v3f,
  v3i,
  v3u,
  v4b,
  v4f,
  v4i,
  v4u,
  Vec2b,
  Vec2f,
  Vec2h,
  Vec2i,
  Vec2u,
  Vec3b,
  Vec3f,
  Vec3h,
  Vec3i,
  Vec3u,
  Vec4b,
  Vec4f,
  Vec4h,
  Vec4i,
  Vec4u,
  WgslArray,
  WgslStruct,
} from './wgslTypes.ts';
export { struct } from './struct.ts';
export { arrayOf } from './array.ts';
export {
  ptrFn,
  ptrHandle,
  ptrPrivate,
  ptrStorage,
  ptrUniform,
  ptrWorkgroup,
} from './ptr.ts';
export type {
  AnyData,
  AnyLooseData,
  Disarray,
  LooseDecorated,
  Unstruct,
} from './dataTypes.ts';
export {
  vec2b,
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec3b,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec4b,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
} from './vector.ts';
export { disarrayOf } from './disarray.ts';
export { unstruct } from './unstruct.ts';
export { mat2x2f, mat3x3f, mat4x4f, matToArray } from './matrix.ts';
export * from './vertexFormatData.ts';
export { atomic } from './atomic.ts';
export {
  align,
  type AnyAttribute,
  type HasCustomLocation,
  interpolate,
  type IsBuiltin,
  isBuiltin,
  location,
  size,
} from './attributes.ts';
export {
  isData,
  isDisarray,
  isLooseData,
  isLooseDecorated,
  isUnstruct,
} from './dataTypes.ts';
export { PUBLIC_sizeOf as sizeOf } from './sizeOf.ts';
export { PUBLIC_alignmentOf as alignmentOf } from './alignmentOf.ts';
export { builtin } from '../builtin.ts';
export type {
  AnyBuiltin,
  BuiltinClipDistances,
  BuiltinFragDepth,
  BuiltinFrontFacing,
  BuiltinGlobalInvocationId,
  BuiltinInstanceIndex,
  BuiltinLocalInvocationId,
  BuiltinLocalInvocationIndex,
  BuiltinNumWorkgroups,
  BuiltinPosition,
  BuiltinSampleIndex,
  BuiltinSampleMask,
  BuiltinVertexIndex,
  BuiltinWorkgroupId,
} from '../builtin.ts';
export type { Infer, InferGPU, InferPartial } from '../shared/repr.ts';
