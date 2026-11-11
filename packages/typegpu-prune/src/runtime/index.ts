/**
 * The pruned runtime. In a precompiled build, the plugin points imports of
 * `@typegpu/prune` here, so that only this code ships instead of TypeGPU.
 */

export { __tgpuPruneAttach } from './attach.ts';
export {
  init,
  initFromDevice,
  PrunedBindGroup,
  PrunedBuffer,
  PrunedCommandEncoder,
  PrunedLayout,
  PrunedRoot,
  PrunedSampler,
  PrunedTexture,
  PrunedTextureView,
  PrunedVertexLayout,
} from './root.ts';
export {
  PrunedComputePipeline,
  PrunedGuardedComputePipeline,
  PrunedRenderPipeline,
} from './pipelines.ts';

export function precompile(): never {
  throw new Error(
    '[@typegpu/prune] A precompile() call reached the pruned runtime without being precompiled. ' +
      'Make sure the call is a direct call of the imported `precompile` with an inline arrow function.',
  );
}
