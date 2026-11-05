import { $internal } from '../../shared/symbols.ts';
import type { LogResources } from '../../tgsl/consoleLog/types.ts';
import type { TgpuComputePipeline } from './computePipeline.ts';
import type { TgpuRenderPipeline } from './renderPipeline.ts';

/**
 * The buffers and call metadata of the `console.log`s in a pipeline's shaders, resolving the
 * pipeline if it wasn't yet. Not part of the pipeline's soul: logs are read back by the runtime
 * that resolved the pipeline, and don't transfer.
 */
export function getLogResources(
  pipeline: TgpuComputePipeline | TgpuRenderPipeline,
): LogResources | undefined {
  return pipeline[$internal].core.unwrap().logResources;
}
