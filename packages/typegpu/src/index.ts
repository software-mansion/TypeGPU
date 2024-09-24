/**
 * @module typegpu
 */

import { createBuffer } from './legacyBufferApi';
import { bindGroupLayout } from './tgpuBindGroupLayout';
import { Storage, Uniform, Vertex } from './tgpuBuffer';
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
} from './tgpuBuffer';

export type {
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
  TgpuLayoutSampler,
  TgpuLayoutUniform,
  BindLayoutEntry,
  LayoutEntryToInput,
  TgpuBindGroup,
} from './tgpuBindGroupLayout';
export type { TgpuBuffer } from './tgpuBuffer';
