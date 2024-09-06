/**
 * @module typegpu
 */

import { read, write } from './tgpuBufferUtils';
import { Storage, Uniform, Vertex, createBuffer } from './wgslBuffer';

export const tgpu = {
  Uniform,
  Storage,
  Vertex,

  createBuffer,
  read,
  write,
};
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
