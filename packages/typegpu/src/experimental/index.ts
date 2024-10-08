/**
 * @module typegpu/experimental
 */

import { Storage, Uniform, Vertex } from '../core/buffer/buffer';
import { createRuntime as init } from '../createRuntime';
import { createBuffer } from '../legacyBufferApi';
import { bindGroupLayout } from '../tgpuBindGroupLayout';
import { read, write } from '../tgpuBufferUtils';
import { fn, procedure } from '../tgpuFn';

export const tgpu = {
  Uniform,
  Storage,
  Vertex,

  fn,
  procedure,
  bindGroupLayout,

  init,

  createBuffer,
  read,
  write,
};
export default tgpu;

export * from '../errors';
export * from '../types';
export * from '../namable';
export * from '../tgpuRuntime';
export { default as ProgramBuilder, type Program } from '../programBuilder';
export { StrictNameRegistry, RandomNameRegistry } from '../nameRegistry';
export * from '../builtin';

export { default as wgsl } from '../wgsl';
export { std } from '../std';
export { createRuntime, CreateRuntimeOptions } from '../createRuntime';
export {
  isUsableAsStorage,
  isUsableAsUniform,
  isUsableAsVertex,
} from '../core/buffer/buffer';
export {
  asUniform,
  asReadonly,
  asMutable,
  asVertex,
} from '../core/buffer/bufferUsage';

export type { TgpuBuffer } from '../core/buffer/buffer';
export type {
  TgpuBufferUsage,
  TgpuBufferUniform,
  TgpuBufferReadonly,
  TgpuBufferMutable,
  TgpuBufferVertex,
} from '../core/buffer/bufferUsage';
export type { TgpuConst } from '../tgpuConstant';
export type { TgpuFn } from '../tgpuFunction';
export type { TgpuPlum } from '../tgpuPlumTypes';
export type { TexelFormat } from '../textureTypes';
export type { TgpuSettable } from '../settableTrait';
export type { TgpuVar } from '../tgpuVariable';
export type { TgpuSampler } from '../tgpuSampler';
export type {
  TgpuTexture,
  TgpuTextureView,
} from '../tgpuTexture';
export type { JitTranspiler } from '../jitTranspiler';
export type * from '../textureTypes';
export type {
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
  TgpuLayoutSampler,
  TgpuLayoutUniform,
  BindLayoutEntry,
  LayoutEntryToInput,
  TgpuBindGroup,
} from '../tgpuBindGroupLayout';
