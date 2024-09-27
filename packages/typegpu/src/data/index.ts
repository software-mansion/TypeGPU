/**
 * @module typegpu/data
 */

export * from './std140';
export * from './numeric';
export * from './struct';
export * from './array';
export * from './vector';
export * from './matrix';
export { ptr } from './pointer';
export { atomic, isAtomicSchema, Atomic } from './atomic';
export {
  align,
  isAlignedSchema,
  isLooseAlignedSchema,
  TgpuAligned,
  TgpuLooseAligned,
} from './align';
export { size, isSizedSchema, TgpuSized } from './size';

// Reexporting type-binary utility types
export type { Parsed, Unwrap } from 'typed-binary';
