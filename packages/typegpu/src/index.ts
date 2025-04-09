/**
 * @module typegpu
 */

import { constant } from './core/constant/tgpuConstant.ts';
import { declare } from './core/declare/tgpuDeclare.ts';
import { assignAst, removedJsImpl } from './core/function/astUtils.ts';
import { computeFn } from './core/function/tgpuComputeFn.ts';
import { fn } from './core/function/tgpuFn.ts';
import { fragmentFn } from './core/function/tgpuFragmentFn.ts';
import { vertexFn } from './core/function/tgpuVertexFn.ts';
import { resolve } from './core/resolve/tgpuResolve.ts';
import { init, initFromDevice } from './core/root/init.ts';
import { comparisonSampler, sampler } from './core/sampler/sampler.ts';
import { accessor } from './core/slot/accessor.ts';
import { derived } from './core/slot/derived.ts';
import { slot } from './core/slot/slot.ts';
import { privateVar, workgroupVar } from './core/variable/tgpuVariable.ts';
import { vertexLayout } from './core/vertexLayout/vertexLayout.ts';
import { bindGroupLayout } from './tgpuBindGroupLayout.ts';

export const tgpu = {
  bindGroupLayout,
  vertexLayout,

  init,
  initFromDevice,

  resolve,

  '~unstable': {
    fn,
    fragmentFn,
    vertexFn,
    computeFn,
    /**
     * @deprecated This feature is now stable, use tgpu.vertexLayout.
     */
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
  __removedJsImpl: removedJsImpl,
});

export {
  MissingBindGroupsError,
  MissingVertexBuffersError,
  MissingLinksError,
  MissingSlotValueError,
  NotUniformError,
  ResolutionError,
} from './errors.ts';
export { StrictNameRegistry, RandomNameRegistry } from './nameRegistry.ts';
export {
  isBuffer,
  isUsableAsVertex,
} from './core/buffer/buffer.ts';
export { isSlot, isDerived } from './core/slot/slotTypes.ts';
export {
  isSampler,
  isComparisonSampler,
} from './core/sampler/sampler.ts';
export {
  isSampledTextureView,
  isStorageTextureView,
  isTexture,
} from './core/texture/texture.ts';
export {
  isUsableAsRender,
  isUsableAsSampled,
} from './core/texture/usageExtension.ts';
export { isUsableAsStorage } from './extension.ts';
export {
  asUniform as unstable_asUniform,
  asReadonly as unstable_asReadonly,
  asMutable as unstable_asMutable,
  isUsableAsUniform,
} from './core/buffer/bufferUsage.ts';
export { isTgpuFn } from './core/function/tgpuFn.ts';

// types

export type {
  TgpuRoot,
  WithBinding,
  WithCompute,
  WithFragment,
  WithVertex,
} from './core/root/rootTypes.ts';
export type { StorageFlag, Storage } from './extension.ts';
export type { TgpuVertexLayout } from './core/vertexLayout/vertexLayout.ts';
export type { TgpuRenderPipeline } from './core/pipeline/renderPipeline.ts';
export type { TgpuComputePipeline } from './core/pipeline/computePipeline.ts';
export type {
  TgpuBuffer,
  UniformFlag,
  Uniform,
  VertexFlag,
  Vertex,
} from './core/buffer/buffer.ts';
export type {
  TgpuBufferUniform,
  TgpuBufferReadonly,
  TgpuBufferMutable,
} from './core/buffer/bufferUsage.ts';
export type {
  TgpuSlot,
  TgpuDerived,
  TgpuAccessor,
  Eventual,
} from './core/slot/slotTypes.ts';
export type {
  TgpuTexture,
  TgpuReadonlyTexture,
  TgpuWriteonlyTexture,
  TgpuMutableTexture,
  TgpuSampledTexture,
  TgpuAnyTextureView,
} from './core/texture/texture.ts';
export type { TextureProps } from './core/texture/textureProps.ts';
export type { Render, Sampled } from './core/texture/usageExtension.ts';
export type { InitOptions, InitFromDeviceOptions } from './core/root/init.ts';
export type { TgpuConst } from './core/constant/tgpuConstant.ts';
export type {
  TgpuVar,
  VariableScope,
} from './core/variable/tgpuVariable.ts';
export type { TgpuSampler } from './core/sampler/sampler.ts';
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
} from './tgpuBindGroupLayout.ts';
export type {
  TgpuFn,
  TgpuFnShell,
} from './core/function/tgpuFn.ts';
export type {
  TgpuVertexFnShell,
  TgpuVertexFn,
} from './core/function/tgpuVertexFn.ts';
export type {
  TgpuFragmentFnShell,
  TgpuFragmentFn,
} from './core/function/tgpuFragmentFn.ts';
export type {
  TgpuComputeFnShell,
  TgpuComputeFn,
} from './core/function/tgpuComputeFn.ts';
export type { TgpuDeclare } from './core/declare/tgpuDeclare.ts';
