/**
 * @module typegpu/experimental
 */

import { constant } from '../core/constant/tgpuConstant';
import { declare } from '../core/declare/tgpuDeclare';
import { assignAst } from '../core/function/astUtils';
import { computeFn } from '../core/function/tgpuComputeFn';
import { fn, procedure } from '../core/function/tgpuFn';
import { fragmentFn } from '../core/function/tgpuFragmentFn';
import { vertexFn } from '../core/function/tgpuVertexFn';
import { resolve } from '../core/resolve/tgpuResolve';
import {
  type InitFromDeviceOptions,
  type InitOptions,
  init,
  initFromDevice,
} from '../core/root/init';
import type { ExperimentalTgpuRoot } from '../core/root/rootTypes';
import { derived } from '../core/slot/derived';
import { slot } from '../core/slot/slot';
import { privateVar, workgroupVar } from '../core/variable/tgpuVariable';
import { vertexLayout } from '../core/vertexLayout/vertexLayout';
import { bindGroupLayout } from '../tgpuBindGroupLayout';

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
  derived,
  slot,
  privateVar,
  workgroupVar,
  const: constant,
  declare,

  init: init as (
    options?: InitOptions | undefined,
  ) => Promise<ExperimentalTgpuRoot>,
  initFromDevice: initFromDevice as (
    options: InitFromDeviceOptions,
  ) => ExperimentalTgpuRoot,

  resolve,
};

// Hidden API, used only by tooling (e.g., rollup plugin).
Object.assign(tgpu, {
  __assignAst: assignAst,
});

export default tgpu;

export {
  MissingBindGroupError,
  MissingLinksError,
  MissingSlotValueError,
  NotUniformError,
  ResolutionError,
} from '../errors';
export type {
  TgpuRoot,
  ExperimentalTgpuRoot,
  WithBinding,
  WithCompute,
  WithFragment,
  WithVertex,
} from '../core/root/rootTypes';
export { StrictNameRegistry, RandomNameRegistry } from '../nameRegistry';

export { std } from '../std';
export {
  isBuffer,
  isUsableAsUniform,
  isUsableAsVertex,
} from '../core/buffer/buffer';
export { isSlot, isDerived } from '../core/slot/slotTypes';
export {
  sampler,
  comparisonSampler,
  isSampler,
  isComparisonSampler,
} from '../core/sampler/sampler';
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
} from '../core/buffer/bufferUsage';
export { withLocations } from '../core/function/ioOutputType';

export type { Storage } from '../extension';
export type { TgpuVertexLayout } from '../core/vertexLayout/vertexLayout';
export type {
  TgpuBuffer,
  Uniform,
  Vertex,
  TgpuBufferUniform,
  TgpuBufferReadonly,
  TgpuBufferMutable,
} from '../core/buffer/public';
export type { TgpuSlot, TgpuDerived, Eventual } from '../core/slot/slotTypes';
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
export type { TgpuConst } from '../core/constant/tgpuConstant';
export type {
  TgpuVar,
  VariableScope,
} from '../core/variable/tgpuVariable';
export type { TgpuSampler } from '../core/sampler/sampler';
export type { JitTranspiler } from '../jitTranspiler';
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
export type {
  IOLayoutToOutputSchema,
  WithLocations,
} from '../core/function/ioOutputType';
export type { TgpuDeclare } from '../core/declare/tgpuDeclare';
