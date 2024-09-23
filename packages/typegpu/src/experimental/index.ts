/**
 * @module typegpu/experimental
 */

import { createRuntime as init } from '../createRuntime';
import { createBuffer } from '../legacyBufferApi';
import { Storage, Uniform, Vertex } from '../tgpuBuffer';
import { read, write } from '../tgpuBufferUtils';
import { fn, procedure } from '../tgpuFn';

export const tgpu = {
  Uniform,
  Storage,
  Vertex,

  init,
  createBuffer,
  procedure,
  fn,

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
} from '../tgpuBuffer';
export { asUniform, asReadonly, asMutable, asVertex } from '../tgpuBufferUsage';

export type { TgpuBuffer } from '../tgpuBuffer';
export type {
  TgpuBufferUsage,
  TgpuBufferUniform,
  TgpuBufferReadonly,
  TgpuBufferMutable,
  TgpuBufferVertex,
} from '../tgpuBufferUsage';
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
