/**
 * @module typegpu
 */

import { resolve } from './core/resolve/tgpuResolve';
import { init, initFromDevice } from './core/root/init';
import { bindGroupLayout } from './tgpuBindGroupLayout';

export const tgpu = {
  /** @hidden @deprecated Use `'uniform'` string literal instead. */
  Uniform: 'uniform' as const,
  /** @hidden @deprecated Use `'storage'` string literal instead. */
  Storage: 'storage' as const,
  /** @hidden @deprecated Use `'vertex'` string literal instead. */
  Vertex: 'vertex' as const,

  bindGroupLayout,

  init,
  initFromDevice,

  resolve,
};
export default tgpu;

export {
  NotUniformError,
  ResolutionError,
} from './errors';
export { TgpuRoot } from './core/root/rootTypes';
export {
  isBuffer,
  isUsableAsUniform,
  isUsableAsVertex,
} from './core/buffer/buffer';
export {
  isSampler,
  isComparisonSampler,
} from './core/sampler/sampler';
export {
  isSampledTextureView,
  isStorageTextureView,
} from './core/texture/texture';
export { isUsableAsStorage } from './extension';

export type { Storage } from './extension';
export type {
  TgpuBuffer,
  Uniform,
  Vertex,
  TgpuBufferUniform,
  TgpuBufferReadonly,
  TgpuBufferMutable,
} from './core/buffer/public';
export type {
  TgpuTexture,
  TgpuReadonlyTexture,
  TgpuWriteonlyTexture,
  TgpuMutableTexture,
  TgpuSampledTexture,
  TgpuAnyTextureView,
} from './core/texture/texture';
export type { InitOptions, InitFromDeviceOptions } from './core/root/init';
export type { TgpuSampler } from './core/sampler/sampler';
export type {
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
  TgpuLayoutSampler,
  TgpuLayoutTexture,
  TgpuLayoutStorage,
  TgpuLayoutStorageTexture,
  TgpuLayoutExternalTexture,
  TgpuLayoutUniform,
  BindLayoutEntry,
  LayoutEntryToInput,
  TgpuBindGroup,
} from './tgpuBindGroupLayout';
export type { TgpuResolveOptions } from './core/resolve/tgpuResolve';
