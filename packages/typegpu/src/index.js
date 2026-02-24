/**
 * @module typegpu
 */

// NOTE: This is a barrel file, internal files should not import things from this file

import * as tgpu from './tgpu.ts';
export * as tgpu from './tgpu.ts';
export default tgpu;

export * as d from './data/index.ts';
export * as std from './std/index.ts';
export * as common from './common/index.ts';

export {
  MissingBindGroupsError,
  MissingLinksError,
  MissingSlotValueError,
  MissingVertexBuffersError,
  NotUniformError,
  ResolutionError,
} from './errors.ts';
export { isBuffer, isUsableAsVertex } from './core/buffer/buffer.ts';
export {
  isAccessor,
  isLazy,
  isMutableAccessor,
  isSlot,
} from './core/slot/slotTypes.ts';
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
export { isTgpuFragmentFn } from './core/function/tgpuFragmentFn.ts';
export { isTgpuVertexFn } from './core/function/tgpuVertexFn.ts';
export { isTgpuComputeFn } from './core/function/tgpuComputeFn.ts';
export { isVariable } from './core/variable/tgpuVariable.ts';
