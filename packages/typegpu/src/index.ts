/**
 * @module typegpu
 */

export { tgpu } from './tgpu';
export { tgpu as default } from './tgpu';

export { RecursiveDataTypeError } from './errors';
export {
  TgpuData,
  AnyTgpuData,
  TexelFormat,
} from './types';
export { std } from './std';

export type {
  TgpuBuffer,
  Unmanaged,
  AllowMutable,
  AllowReadonly,
  AllowUniform,
  AllowVertex,
} from './wgslBuffer';
