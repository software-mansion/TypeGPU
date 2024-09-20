/**
 * @module typegpu
 */

import { createBuffer } from './legacy-buffer-api';
import { Storage, Uniform, Vertex } from './tgpuBuffer';
import { read, write } from './tgpuBufferUtils';

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
} from './types';
export { std } from './std';
export {
  isUsableAsStorage,
  isUsableAsUniform,
  isUsableAsVertex,
} from './tgpuBuffer';

export type { TgpuBuffer } from './tgpuBuffer';
