/**
 * @module typegpu/data
 */

export * from './std140';
export * from './numeric';
export { TgpuStruct, struct } from './struct';
export { TgpuArray, arrayOf } from './array';
export * from './vector';
export * from './matrix';
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
