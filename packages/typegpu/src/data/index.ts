/**
 * @module typegpu/data
 */

export * from './std140';
export * from './numeric';
export {
  TgpuStruct,
  TgpuLooseStruct,
  isStructSchema,
  struct,
  looseStruct,
  isLooseStructSchema,
} from './struct';
export {
  TgpuArray,
  TgpuLooseArray,
  isArraySchema,
  arrayOf,
  looseArrayOf,
  isLooseArraySchema,
} from './array';
export * from './vector';
export * from './matrix';
export * from './vertexAttribute';
export { ptr } from './pointer';
export { atomic, isAtomicSchema, Atomic } from './atomic';
export {
  align,
  size,
  isDecorated,
  isLooseDecorated,
  Align,
  Size,
  Decorated,
  LooseDecorated,
} from './attributes';

// Reexporting type-binary utility types
export type { Parsed, Unwrap } from 'typed-binary';
