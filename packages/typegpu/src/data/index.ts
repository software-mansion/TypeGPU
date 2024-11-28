/**
 * @module typegpu/data
 */

export * from './numeric';
export {
  TgpuStruct,
  isStructSchema,
  struct,
} from './struct';
export {
  TgpuArray,
  arrayOf,
} from './array';
export * from './vector';
export * from './matrix';
export * from './vertexFormatData';
export { atomic, isAtomicSchema, Atomic } from './atomic';
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
