/**
 * @module typegpu/experimental
 */

export * as tgpu from '../tgpu';
import * as tgpu from '../tgpu';
export default tgpu;

export * from '../errors';
export * from '../types';
export { AsCallable, Callable } from '../callable';
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

export type {
  TgpuBuffer,
  Unmanaged,
} from '../tgpuBuffer';
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
export type { TgpuFn as TgpuFnExperimental } from '../tgpuFunctionExperimental';
export type { TgpuVar } from '../tgpuVariable';
export type { TgpuSampler } from '../tgpuSampler';
export type {
  TgpuTexture,
  TgpuTextureView,
} from '../tgpuTexture';
export type * from '../textureTypes';
