/**
 * @module typegpu
 */

import { type InitOptions, init, initFromDevice } from './core/root/init';
import type { TgpuRoot } from './core/root/rootTypes';
import { createBuffer } from './legacyBufferApi';
import { bindGroupLayout } from './tgpuBindGroupLayout';
import { read, write } from './tgpuBufferUtils';

export const tgpu = {
  /** @deprecated Use `'uniform'` string literal instead. */
  Uniform: 'uniform' as const,
  /** @deprecated Use `'storage'` string literal instead. */
  Storage: 'storage' as const,
  /** @deprecated Use `'vertex'` string literal instead. */
  Vertex: 'vertex' as const,

  bindGroupLayout,

  init: init as (options?: InitOptions) => Promise<TgpuRoot>,
  initFromDevice,

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
export type {
  TgpuBuffer,
  Uniform,
  Storage,
  Vertex,
} from './core/buffer/buffer';
export type { TgpuRoot } from './core/root/rootTypes';
