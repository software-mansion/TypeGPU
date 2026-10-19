/**
 * @module typegpu/data
 */

// NOTE: This is a barrel file, internal files should not import things from this file

import { assignInfixOperators } from './assignInfixOperators.ts';

import {
  vec2b as _vec2b,
  vec2f as _vec2f,
  vec2h as _vec2h,
  vec2i as _vec2i,
  vec2u as _vec2u,
  vec3b as _vec3b,
  vec3f as _vec3f,
  vec3h as _vec3h,
  vec3i as _vec3i,
  vec3u as _vec3u,
  vec4b as _vec4b,
  vec4f as _vec4f,
  vec4h as _vec4h,
  vec4i as _vec4i,
  vec4u as _vec4u,
} from './vector.ts';

export const vec2b = (() => (assignInfixOperators(), _vec2b))();
export const vec2f = (() => (assignInfixOperators(), _vec2f))();
export const vec2h = (() => (assignInfixOperators(), _vec2h))();
export const vec2i = (() => (assignInfixOperators(), _vec2i))();
export const vec2u = (() => (assignInfixOperators(), _vec2u))();
export const vec3b = (() => (assignInfixOperators(), _vec3b))();
export const vec3f = (() => (assignInfixOperators(), _vec3f))();
export const vec3h = (() => (assignInfixOperators(), _vec3h))();
export const vec3i = (() => (assignInfixOperators(), _vec3i))();
export const vec3u = (() => (assignInfixOperators(), _vec3u))();
export const vec4b = (() => (assignInfixOperators(), _vec4b))();
export const vec4f = (() => (assignInfixOperators(), _vec4f))();
export const vec4h = (() => (assignInfixOperators(), _vec4h))();
export const vec4i = (() => (assignInfixOperators(), _vec4i))();
export const vec4u = (() => (assignInfixOperators(), _vec4u))();

import { mat2x2f as _mat2x2f, mat3x3f as _mat3x3f, mat4x4f as _mat4x4f } from './matrix.ts';

export const mat2x2f = (() => (assignInfixOperators(), _mat2x2f))();
export const mat3x3f = (() => (assignInfixOperators(), _mat3x3f))();
export const mat4x4f = (() => (assignInfixOperators(), _mat4x4f))();

export { bool, f16, f32, i32, u16, u32 } from './numeric.ts';
export {
  isAlignAttrib,
  isAtomic,
  isBuiltinAttrib,
  isDecorated,
  isInterpolateAttrib,
  isInvariantAttrib,
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
  atomicI32,
  atomicU32,
  BaseData,
  BaseData as BaseWgslData,
  Bool,
  Builtin,
  Decorated,
  F16,
  F32,
  I32,
  Interpolate,
  Invariant,
  Location,
  m2x2f,
  m3x3f,
  m4x4f,
  Mat2x2f,
  Mat3x3f,
  Mat4x4f,
  matBase,
  Ptr,
  Size,
  StorableData,
  U16,
  U32,
  v2b,
  v2f,
  v2h,
  v2i,
  v2u,
  v3b,
  v3f,
  v3h,
  v3i,
  v3u,
  v4b,
  v4f,
  v4h,
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
  vecBase,
  WgslArray,
  WgslStruct,
} from './wgslTypes.ts';
export { struct } from './struct.ts';
export { arrayOf } from './array.ts';
export { ptrFn, ptrHandle, ptrPrivate, ptrStorage, ptrUniform, ptrWorkgroup } from './ptr.ts';
export type { AnyData, AnyLooseData, Disarray, LooseDecorated, Unstruct } from './dataTypes.ts';
export {
  texture1d,
  texture2d,
  texture2dArray,
  texture3d,
  textureCube,
  textureCubeArray,
  textureDepth2d,
  textureDepth2dArray,
  textureDepthCube,
  textureDepthCubeArray,
  textureDepthMultisampled2d,
  textureExternal,
  textureMultisampled2d,
  textureStorage1d,
  textureStorage2d,
  textureStorage2dArray,
  textureStorage3d,
  type WgslExternalTexture,
  type WgslStorageTexture,
  type WgslStorageTexture1d,
  type WgslStorageTexture2d,
  type WgslStorageTexture2dArray,
  type WgslStorageTexture3d,
  type WgslStorageTextureProps,
  type WgslTexture,
  type WgslTexture1d,
  type WgslTexture2d,
  type WgslTexture2dArray,
  type WgslTexture3d,
  type WgslTextureCube,
  type WgslTextureCubeArray,
  type WgslTextureDepth2d,
  type WgslTextureDepth2dArray,
  type WgslTextureDepthCube,
  type WgslTextureDepthCubeArray,
  type WgslTextureDepthMultisampled2d,
  type WgslTextureMultisampled2d,
} from './texture.ts';
export {
  comparisonSampler,
  sampler,
  type WgslComparisonSampler,
  type WgslSampler,
} from './sampler.ts';
export { disarrayOf } from './disarray.ts';
export { unstruct } from './unstruct.ts';
export { matToArray } from './matrix.ts';
export * from './vertexFormatData.ts';
export { atomic } from './atomic.ts';
export { _ref as ref } from './ref.ts';
export {
  align,
  type AnyAttribute,
  type HasCustomLocation,
  interpolate,
  invariant,
  type IsBuiltin,
  isBuiltin,
  location,
  size,
} from './attributes.ts';
export { isData, isDisarray, isLooseData, isLooseDecorated, isUnstruct } from './dataTypes.ts';
export { PUBLIC_sizeOf as sizeOf } from './sizeOf.ts';
export { PUBLIC_isContiguous as isContiguous } from './isContiguous.ts';
export { PUBLIC_getLongestContiguousPrefix as getLongestContiguousPrefix } from './getLongestContiguousPrefix.ts';
export { memoryLayoutOf } from './offsetUtils.ts';
export { PUBLIC_alignmentOf as alignmentOf } from './alignmentOf.ts';
export { builtin } from '../builtin.ts';
export { deepEqual } from './deepEqual.ts';
export type {
  AnyBuiltin,
  BuiltinClipDistances,
  BuiltinFragDepth,
  BuiltinFrontFacing,
  BuiltinGlobalInvocationId,
  BuiltinGlobalInvocationIndex,
  BuiltinInstanceIndex,
  BuiltinLocalInvocationId,
  BuiltinLocalInvocationIndex,
  BuiltinNumSubgroups,
  BuiltinNumWorkgroups,
  BuiltinPosition,
  BuiltinPrimitiveIndex,
  BuiltinSampleIndex,
  BuiltinSampleMask,
  BuiltinSubgroupId,
  BuiltinSubgroupInvocationId,
  BuiltinSubgroupSize,
  BuiltinVertexIndex,
  BuiltinWorkgroupId,
  BuiltinWorkgroupIndex,
} from '../builtin.ts';
export type {
  Infer,
  InferGPU,
  InferInput,
  InferPartial,
  InferPatch,
  MemIdentity,
} from '../shared/repr.ts';
