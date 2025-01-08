/**
 * @module typegpu
 */

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
};
export default tgpu;

export {
  isUsableAsUniform,
  isUsableAsVertex,
} from './core/buffer/buffer';
export { isUsableAsStorage } from './extension';

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
  Vertex,
} from './core/buffer/public';
export type { Storage } from './extension';
export type { TgpuRoot } from './core/root/rootTypes';
