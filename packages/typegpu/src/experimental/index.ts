/**
 * @module typegpu/experimental
 */

export * as tgpu from '../tgpu';
import * as tgpu from '../tgpu';
export default tgpu;

export * from '../errors';
export * from '../types';
export { AsCallable, Callable } from '../callable';
export * from '../typegpuRuntime';
export { default as ProgramBuilder, type Program } from '../programBuilder';
export { StrictNameRegistry, RandomNameRegistry } from '../nameRegistry';
export * from '../wgslBuiltin';

export { default as wgsl } from '../wgsl';
export { std } from '../std';
export { createRuntime, CreateRuntimeOptions } from '../createRuntime';
export {
  isUsableAsStorage,
  isUsableAsUniform,
  isUsableAsVertex,
} from '../wgslBuffer';
export { asUniform, asReadonly, asMutable, asVertex } from '../wgslBufferUsage';

export type {
  TgpuBuffer,
  Unmanaged,
} from '../wgslBuffer';
export type {
  TgpuBufferUsage,
  TgpuBufferUniform,
  TgpuBufferReadonly,
  TgpuBufferMutable,
  TgpuBufferVertex,
} from '../wgslBufferUsage';
export type { TgpuCode } from '../wgslCode';
export type { TgpuConst } from '../wgslConstant';
export type { TgpuFn } from '../wgslFunction';
export type { TgpuPlum } from '../wgslPlum';
export type { TgpuSettable } from '../settableTrait';
export type { TgpuFn as TgpuFnExperimental } from '../wgslFunctionExperimental';
export type { TgpuVar } from '../wgslVariable';
export type { TgpuSampler } from '../wgslSampler';
export type {
  TgpuTexture,
  TgpuTextureView,
} from '../wgslTexture';
export type { JitTranspiler } from '../jitTranspiler';
