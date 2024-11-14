/**
 * @module typegpu/experimental
 */

import { computeFn } from '../core/function/tgpuComputeFn';
import { fn, procedure } from '../core/function/tgpuFn';
import { fragmentFn } from '../core/function/tgpuFragmentFn';
import { vertexFn } from '../core/function/tgpuVertexFn';
import { init, initFromDevice } from '../core/root/init';
import { vertexLayout } from '../core/vertexLayout/vertexLayout';
import { createBuffer } from '../legacyBufferApi';
import { bindGroupLayout } from '../tgpuBindGroupLayout';
import { read, write } from '../tgpuBufferUtils';

export const tgpu = {
  /** @deprecated Use `'uniform'` string literal instead. */
  Uniform: 'uniform' as const,
  /** @deprecated Use `'storage'` string literal instead. */
  Storage: 'storage' as const,
  /** @deprecated Use `'vertex'` string literal instead. */
  Vertex: 'vertex' as const,

  fn,
  procedure,
  fragmentFn,
  vertexFn,
  computeFn,
  vertexLayout,
  bindGroupLayout,

  init,
  initFromDevice,

  createBuffer,
  read,
  write,
};
export default tgpu;

export * from '../errors';
export * from '../types';
export * from '../namable';
export * from '../core/root/rootTypes';
export { default as ProgramBuilder, type Program } from '../programBuilder';
export { StrictNameRegistry, RandomNameRegistry } from '../nameRegistry';
export * from '../builtin';

export { default as wgsl } from '../wgsl';
export { std } from '../std';
export {
  isUsableAsUniform,
  isUsableAsVertex,
} from '../core/buffer/buffer';
export {
  isSampledTextureView,
  isStorageTextureView,
  isTexture,
} from '../core/texture/texture';
export {
  isUsableAsRender,
  isUsableAsSampled,
} from '../core/texture/usageExtension';
export { isUsableAsStorage } from '../extension';
export {
  asUniform,
  asReadonly,
  asMutable,
  asVertex,
} from '../core/buffer/bufferUsage';

export type {
  TgpuBuffer,
  Uniform,
  Vertex,
} from '../core/buffer/buffer';
export type { Storage } from '../extension';
export type { TgpuVertexLayout } from '../core/vertexLayout/vertexLayout';
export type {
  TgpuBufferUsage,
  TgpuBufferUniform,
  TgpuBufferReadonly,
  TgpuBufferMutable,
  TgpuBufferVertex,
} from '../core/buffer/bufferUsage';
export type {
  TgpuTexture,
  TgpuReadonlyTexture,
  TgpuWriteonlyTexture,
  TgpuMutableTexture,
  TgpuSampledTexture,
  TgpuAnyTextureView,
} from '../core/texture/texture';
export type { TextureProps } from '../core/texture/textureProps';
export type { Render, Sampled } from '../core/texture/usageExtension';
export type { InitOptions, InitFromDeviceOptions } from '../core/root/init';
export type { TgpuConst } from '../tgpuConstant';
export type { TgpuPlum } from '../tgpuPlumTypes';
export type { TgpuSettable } from '../settableTrait';
export type { TgpuVar } from '../tgpuVariable';
export type { TgpuSampler } from '../tgpuSampler';
export type { JitTranspiler } from '../jitTranspiler';
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
