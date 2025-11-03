/**
 * @module typegpu
 */

import { constant } from './core/constant/tgpuConstant.ts';
import { declare } from './core/declare/tgpuDeclare.ts';
import { computeFn } from './core/function/tgpuComputeFn.ts';
import { fn } from './core/function/tgpuFn.ts';
import { fragmentFn } from './core/function/tgpuFragmentFn.ts';
import { vertexFn } from './core/function/tgpuVertexFn.ts';
import { resolve, resolveWithContext } from './core/resolve/tgpuResolve.ts';
import { simulate } from './core/simulate/tgpuSimulate.ts';
import { init, initFromDevice } from './core/root/init.ts';

import { accessor } from './core/slot/accessor.ts';
import { derived } from './core/slot/derived.ts';
import { slot } from './core/slot/slot.ts';
import { privateVar, workgroupVar } from './core/variable/tgpuVariable.ts';
import { vertexLayout } from './core/vertexLayout/vertexLayout.ts';
import { bindGroupLayout } from './tgpuBindGroupLayout.ts';
import { namespace } from './core/resolve/namespace.ts';

export const tgpu = {
  fn,
  bindGroupLayout,
  vertexLayout,
  slot,

  init,
  initFromDevice,

  resolve,
  resolveWithContext,

  privateVar,
  workgroupVar,
  const: constant,

  '~unstable': {
    /**
     * @deprecated This feature is now stable, use tgpu.fn.
     */
    fn,
    fragmentFn,
    vertexFn,
    computeFn,
    /**
     * @deprecated This feature is now stable, use tgpu.vertexLayout.
     */
    vertexLayout,
    namespace,
    derived,
    /**
     * @deprecated This feature is now stable, use tgpu.slot.
     */
    slot,
    accessor,
    /**
     * @deprecated This feature is now stable, use tgpu.privateVar.
     */
    privateVar,
    /**
     * @deprecated This feature is now stable, use tgpu.workgroupVar.
     */
    workgroupVar,
    /**
     * @deprecated This feature is now stable, use tgpu.const.
     */
    const: constant,
    declare,

    simulate,
  },
};
export default tgpu;

export {
  MissingBindGroupsError,
  MissingLinksError,
  MissingSlotValueError,
  MissingVertexBuffersError,
  NotUniformError,
  ResolutionError,
} from './errors.ts';
export { isBuffer, isUsableAsVertex } from './core/buffer/buffer.ts';
export { isDerived, isSlot } from './core/slot/slotTypes.ts';
export { isComparisonSampler, isSampler } from './core/sampler/sampler.ts';
export { isTexture } from './core/texture/texture.ts';
export {
  isUsableAsRender,
  isUsableAsSampled,
} from './core/texture/usageExtension.ts';
export { isUsableAsStorage } from './extension.ts';
export { isUsableAsUniform } from './core/buffer/bufferUsage.ts';
export { isBufferShorthand } from './core/buffer/bufferShorthand.ts';
export { isTgpuFn } from './core/function/tgpuFn.ts';
export { isVariable } from './core/variable/tgpuVariable.ts';

// types

export type {
  Configurable,
  TgpuGuardedComputePipeline,
  TgpuRoot,
  ValidateBufferSchema,
  ValidateStorageSchema,
  ValidateUniformSchema,
  WithBinding,
  WithCompute,
  WithFragment,
  WithVertex,
} from './core/root/rootTypes.ts';
export type { Storage, StorageFlag } from './extension.ts';
export type { TgpuVertexLayout } from './core/vertexLayout/vertexLayout.ts';
export type { TgpuRenderPipeline } from './core/pipeline/renderPipeline.ts';
export type { TgpuComputePipeline } from './core/pipeline/computePipeline.ts';
export type {
  IndexFlag,
  TgpuBuffer,
  Uniform,
  UniformFlag,
  ValidUsagesFor,
  Vertex,
  VertexFlag,
} from './core/buffer/buffer.ts';
export type {
  TgpuBufferMutable,
  TgpuBufferReadonly,
  TgpuBufferUniform,
} from './core/buffer/bufferUsage.ts';
export type {
  TgpuMutable,
  TgpuReadonly,
  TgpuUniform,
} from './core/buffer/bufferShorthand.ts';
export type {
  Eventual,
  TgpuAccessor,
  TgpuDerived,
  TgpuSlot,
} from './core/slot/slotTypes.ts';
export type { TgpuTexture, TgpuTextureView } from './core/texture/texture.ts';
export type { TextureProps } from './core/texture/textureProps.ts';
export type { RenderFlag, SampledFlag } from './core/texture/usageExtension.ts';
export type { InitFromDeviceOptions, InitOptions } from './core/root/init.ts';
export type { TgpuConst } from './core/constant/tgpuConstant.ts';
export type { TgpuVar, VariableScope } from './core/variable/tgpuVariable.ts';
export type {
  TgpuComparisonSampler,
  TgpuFixedComparisonSampler,
  TgpuFixedSampler,
  TgpuSampler,
} from './core/sampler/sampler.ts';
export type { TgpuQuerySet } from './core/querySet/querySet.ts';
export type {
  BindLayoutEntry,
  ExtractBindGroupInputFromLayout,
  LayoutEntryToInput,
  TgpuBindGroup,
  TgpuBindGroupLayout,
  TgpuLayoutComparisonSampler,
  TgpuLayoutEntry,
  TgpuLayoutExternalTexture,
  TgpuLayoutSampler,
  TgpuLayoutStorage,
  TgpuLayoutTexture,
  TgpuLayoutUniform,
} from './tgpuBindGroupLayout.ts';
export type { TgpuFn, TgpuFnShell } from './core/function/tgpuFn.ts';
export type {
  TgpuVertexFn,
  TgpuVertexFnShell,
} from './core/function/tgpuVertexFn.ts';
export type {
  TgpuFragmentFn,
  TgpuFragmentFnShell,
} from './core/function/tgpuFragmentFn.ts';
export type {
  TgpuComputeFn,
  TgpuComputeFnShell,
} from './core/function/tgpuComputeFn.ts';
export type { TgpuDeclare } from './core/declare/tgpuDeclare.ts';
export type { Namespace } from './core/resolve/namespace.ts';
// Exported for being able to track use of these global extensions easier,
// and to establish a solid contract between tooling using them.
export type { INTERNAL_GlobalExt } from './shared/meta.ts';
