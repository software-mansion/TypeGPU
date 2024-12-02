/**
 * @module typegpu/data
 */

export * from './numeric';
export type {
  F32,
  I32,
  U32,
  WgslStruct,
  WgslArray,
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
  AnyData,
  AnyLooseData,
} from './dataTypes';
export * from './vector';
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
  LooseDecorated,
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
