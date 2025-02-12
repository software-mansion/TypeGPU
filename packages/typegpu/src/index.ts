/**
 * @module typegpu
 */

import { constant } from './core/constant/tgpuConstant';
import { declare } from './core/declare/tgpuDeclare';
import { assignAst } from './core/function/astUtils';
import { computeFn } from './core/function/tgpuComputeFn';
import { fn } from './core/function/tgpuFn';
import { fragmentFn } from './core/function/tgpuFragmentFn';
import { vertexFn } from './core/function/tgpuVertexFn';
import { resolve } from './core/resolve/tgpuResolve';
import { init, initFromDevice } from './core/root/init';
import { comparisonSampler, sampler } from './core/sampler/sampler';
import { accessor } from './core/slot/accessor';
import { derived } from './core/slot/derived';
import { slot } from './core/slot/slot';
import { privateVar, workgroupVar } from './core/variable/tgpuVariable';
import { vertexLayout } from './core/vertexLayout/vertexLayout';
import { bindGroupLayout } from './tgpuBindGroupLayout';

export const tgpu = {
  bindGroupLayout,

  init,
  initFromDevice,

  resolve,

  '~unstable': {
    fn,
    fragmentFn,
    vertexFn,
    computeFn,
    vertexLayout,
    derived,
    slot,
    accessor,
    privateVar,
    workgroupVar,
    const: constant,
    declare,
    sampler,
    comparisonSampler,
  },
};
export default tgpu;

// Hidden API, used only by tooling (e.g., rollup plugin).
Object.assign(tgpu, {
  __assignAst: assignAst,
});

export {
  MissingBindGroupsError,
  MissingVertexBuffersError,
  MissingLinksError,
  MissingSlotValueError,
  NotUniformError,
  ResolutionError,
} from './errors';
export { StrictNameRegistry, RandomNameRegistry } from './nameRegistry';
export {
  isBuffer,
  isUsableAsVertex,
} from './core/buffer/buffer';
export { isSlot, isDerived } from './core/slot/slotTypes';
export {
  isSampler,
  isComparisonSampler,
} from './core/sampler/sampler';
export {
  isSampledTextureView,
  isStorageTextureView,
  isTexture,
} from './core/texture/texture';
export {
  isUsableAsRender,
  isUsableAsSampled,
} from './core/texture/usageExtension';
export { isUsableAsStorage } from './extension';
export {
  asUniform as unstable_asUniform,
  asReadonly as unstable_asReadonly,
  asMutable as unstable_asMutable,
  isUsableAsUniform,
} from './core/buffer/bufferUsage';
export { isTgpuFn } from './core/function/tgpuFn';

// types

export type {
  TgpuRoot,
  WithBinding,
  WithCompute,
  WithFragment,
  WithVertex,
} from './core/root/rootTypes';
export type { Storage } from './extension';
export type { TgpuVertexLayout } from './core/vertexLayout/vertexLayout';
export type { TgpuRenderPipeline } from './core/pipeline/renderPipeline';
export type { TgpuComputePipeline } from './core/pipeline/computePipeline';
export type {
  TgpuBuffer,
  Uniform,
  Vertex,
} from './core/buffer/buffer';
export type {
  TgpuBufferUniform,
  TgpuBufferReadonly,
  TgpuBufferMutable,
} from './core/buffer/bufferUsage';
export type {
  TgpuSlot,
  TgpuDerived,
  TgpuAccessor,
  Eventual,
} from './core/slot/slotTypes';
export type {
  TgpuTexture,
  TgpuReadonlyTexture,
  TgpuWriteonlyTexture,
  TgpuMutableTexture,
  TgpuSampledTexture,
  TgpuAnyTextureView,
} from './core/texture/texture';
export type { TextureProps } from './core/texture/textureProps';
export type { Render, Sampled } from './core/texture/usageExtension';
export type { InitOptions, InitFromDeviceOptions } from './core/root/init';
export type { TgpuConst } from './core/constant/tgpuConstant';
export type {
  TgpuVar,
  VariableScope,
} from './core/variable/tgpuVariable';
export type { TgpuSampler } from './core/sampler/sampler';
export type {
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
  TgpuLayoutSampler,
  TgpuLayoutComparisonSampler,
  TgpuLayoutTexture,
  TgpuLayoutStorage,
  TgpuLayoutStorageTexture,
  TgpuLayoutExternalTexture,
  TgpuLayoutUniform,
  BindLayoutEntry,
  LayoutEntryToInput,
  TgpuBindGroup,
} from './tgpuBindGroupLayout';
export type {
  TgpuFn,
  TgpuFnShell,
} from './core/function/tgpuFn';
export type {
  TgpuVertexFnShell,
  TgpuVertexFn,
} from './core/function/tgpuVertexFn';
export type {
  TgpuFragmentFnShell,
  TgpuFragmentFn,
} from './core/function/tgpuFragmentFn';
export type {
  TgpuComputeFnShell,
  TgpuComputeFn,
} from './core/function/tgpuComputeFn';
export type { TgpuDeclare } from './core/declare/tgpuDeclare';
