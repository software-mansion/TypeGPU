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
} from './struct';
export {
  TgpuArray,
  TgpuLooseArray,
  isArraySchema,
  arrayOf,
  looseArrayOf,
} from './array';
export * from './vector';
export * from './matrix';
export * from './vertexAttribute';
export { ptr } from './pointer';
export { atomic, isAtomicSchema, Atomic } from './atomic';
export {
  align,
  isAlignedSchema,
  TgpuAligned,
} from './align';
export { size, isSizedSchema, TgpuSized } from './size';

// Reexporting type-binary utility types
export type { Parsed, Unwrap } from 'typed-binary';
