/**
 * @module typegpu
 */

import { Storage, Uniform, Vertex } from './core/buffer/buffer';
import { createBuffer } from './legacyBufferApi';
import { bindGroupLayout } from './tgpuBindGroupLayout';
import { read, write } from './tgpuBufferUtils';

export const tgpu = {
  Uniform,
  Storage,
  Vertex,

  bindGroupLayout,

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
} from './core/buffer/buffer';

export type {
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
  TgpuLayoutSampler,
  TgpuLayoutUniform,
  BindLayoutEntry,
  LayoutEntryToInput,
  TgpuBindGroup,
} from './tgpuBindGroupLayout';
export type { TgpuBuffer } from './core/buffer/buffer';
