/**
 * @module typegpu
 */

// NOTE: This is a barrel file, internal files should not import things from this file

import * as tgpu from './tgpu.ts';

export * as tgpu from './tgpu.ts';
export default tgpu;

export * as common from './common/index.ts';
export { isBuffer, isUsableAsVertex } from './core/buffer/buffer.ts';
export { isBufferShorthand } from './core/buffer/bufferShorthand.ts';
export { isUsableAsUniform } from './core/buffer/bufferUsage.ts';
export { isTgpuComputeFn } from './core/function/tgpuComputeFn.ts';
export { isTgpuFn } from './core/function/tgpuFn.ts';
export { isTgpuFragmentFn } from './core/function/tgpuFragmentFn.ts';
export { isTgpuVertexFn } from './core/function/tgpuVertexFn.ts';
export { isComparisonSampler, isSampler } from './core/sampler/sampler.ts';
export {
  isAccessor,
  isLazy,
  isMutableAccessor,
  isSlot,
} from './core/slot/slotTypes.ts';
export { isTexture } from './core/texture/texture.ts';
export {
  isUsableAsRender,
  isUsableAsSampled,
} from './core/texture/usageExtension.ts';
export { isVariable } from './core/variable/tgpuVariable.ts';
export * as d from './data/index.ts';
export {
  MissingBindGroupsError,
  MissingLinksError,
  MissingSlotValueError,
  MissingVertexBuffersError,
  NotUniformError,
  ResolutionError,
} from './errors.ts';
export { isUsableAsStorage } from './extension.ts';
export * as std from './std/index.ts';

// types

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
  TgpuMutable,
  TgpuReadonly,
  TgpuUniform,
} from './core/buffer/bufferShorthand.ts';
export type {
  TgpuBufferMutable,
  TgpuBufferReadonly,
  TgpuBufferUniform,
} from './core/buffer/bufferUsage.ts';
export type { TgpuConst } from './core/constant/tgpuConstant.ts';
export type { TgpuDeclare } from './core/declare/tgpuDeclare.ts';
export type { TgpuComptime } from './core/function/comptime.ts';
export type {
  TgpuComputeFn,
  TgpuComputeFnShell,
} from './core/function/tgpuComputeFn.ts';
export type { TgpuFn, TgpuFnShell } from './core/function/tgpuFn.ts';
export type {
  TgpuFragmentFn,
  TgpuFragmentFnShell,
} from './core/function/tgpuFragmentFn.ts';
export type {
  TgpuVertexFn,
  TgpuVertexFnShell,
} from './core/function/tgpuVertexFn.ts';
export type { TgpuComputePipeline } from './core/pipeline/computePipeline.ts';
export type { TgpuRenderPipeline } from './core/pipeline/renderPipeline.ts';
export type { TgpuQuerySet } from './core/querySet/querySet.ts';
export type {
  RawCodeSnippetOrigin,
  TgpuRawCodeSnippet,
} from './core/rawCodeSnippet/tgpuRawCodeSnippet.ts';
export type { Namespace } from './core/resolve/namespace.ts';
export type { InitFromDeviceOptions, InitOptions } from './core/root/init.ts';
export type {
  Configurable,
  TgpuGuardedComputePipeline,
  TgpuRoot,
  ValidateBufferSchema,
  ValidateStorageSchema,
  ValidateUniformSchema,
  Withable,
  WithBinding,
  WithCompute,
  WithFragment,
  WithVertex,
} from './core/root/rootTypes.ts';
export type {
  TgpuComparisonSampler,
  TgpuFixedComparisonSampler,
  TgpuFixedSampler,
  TgpuSampler,
} from './core/sampler/sampler.ts';
export type {
  Eventual,
  TgpuAccessor,
  TgpuLazy,
  TgpuMutableAccessor,
  TgpuSlot,
} from './core/slot/slotTypes.ts';
export type { TgpuTexture, TgpuTextureView } from './core/texture/texture.ts';
export type { TextureProps } from './core/texture/textureProps.ts';
export type { RenderFlag, SampledFlag } from './core/texture/usageExtension.ts';
export type { TgpuVar, VariableScope } from './core/variable/tgpuVariable.ts';
export type { TgpuVertexLayout } from './core/vertexLayout/vertexLayout.ts';
export type { Storage, StorageFlag } from './extension.ts';
// Exported for being able to track use of these global extensions easier,
// and to establish a solid contract between tooling using them.
export type { INTERNAL_GlobalExt } from './shared/meta.ts';
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
