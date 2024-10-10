/**
 * @module typegpu/experimental
 */

import { Storage, Uniform, Vertex } from '../core/buffer/buffer';
import { computeFn } from '../core/function/tgpuComputeFn';
import { fn, procedure } from '../core/function/tgpuFn';
import { fragmentFn } from '../core/function/tgpuFragmentFn';
import { vertexFn } from '../core/function/tgpuVertexFn';
import { vertexLayout } from '../core/vertexLayout/vertexLayout';
import { createRoot as init } from '../createRoot';
import { createBuffer } from '../legacyBufferApi';
import { bindGroupLayout } from '../tgpuBindGroupLayout';
import { read, write } from '../tgpuBufferUtils';

export const tgpu = {
  Uniform,
  Storage,
  Vertex,

  fn,
  procedure,
  fragmentFn,
  vertexFn,
  computeFn,
  vertexLayout,
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
export * from '../tgpuRoot';
export { default as ProgramBuilder, type Program } from '../programBuilder';
export { StrictNameRegistry, RandomNameRegistry } from '../nameRegistry';
export * from '../builtin';

export { default as wgsl } from '../wgsl';
export { std } from '../std';
export { createRoot, CreateRootOptions } from '../createRoot';
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
export type { TgpuVertexLayout } from '../core/vertexLayout/vertexLayout';
export type {
  TgpuBufferUsage,
  TgpuBufferUniform,
  TgpuBufferReadonly,
  TgpuBufferMutable,
  TgpuBufferVertex,
} from '../core/buffer/bufferUsage';
export type { TgpuConst } from '../tgpuConstant';
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
export type {
  TgpuFn,
  TgpuFnShell,
} from '../core/function/tgpuFn';
export type {
  TgpuVertexFnShell,
  TgpuVertexFn,
} from '../core/function/tgpuVertexFn';
export type {
  TgpuFragmentFnShell,
  TgpuFragmentFn,
} from '../core/function/tgpuFragmentFn';
export type {
  TgpuComputeFnShell,
  TgpuComputeFn,
} from '../core/function/tgpuComputeFn';
