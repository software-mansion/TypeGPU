import { init, initFromDevice } from './core/root/init';
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

  init,
  initFromDevice,

  createBuffer,
  read,
  write,
};
export default tgpu;

export { std } from './std';
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
} from './core/buffer/buffer';
export type { Storage } from './extension';
