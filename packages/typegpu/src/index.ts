/**
 * @module typegpu
 */

export * as tgpu from './tgpu';
import * as tgpu from './tgpu';
export default tgpu;

export { RecursiveDataTypeError } from './errors';
export {
  TgpuData,
  AnyTgpuData,
  TexelFormat,
} from './types';
export { std } from './std';
export {
  isUsableAsStorage,
  isUsableAsUniform,
  isUsableAsVertex,
} from './wgslBuffer';

export type {
  TgpuBuffer,
  Unmanaged,
} from './wgslBuffer';
