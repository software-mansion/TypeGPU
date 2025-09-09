import { $internal } from '../../shared/symbols.ts';
import type { TgpuComputePipeline } from './computePipeline.ts';
import type { TgpuRenderPipeline } from './renderPipeline.ts';

export function isComputePipeline(
  value: unknown,
): value is TgpuComputePipeline {
  const maybe = value as TgpuComputePipeline | undefined;
  return maybe?.resourceType === 'compute-pipeline' && !!maybe[$internal];
}

export function isRenderPipeline(value: unknown): value is TgpuRenderPipeline {
  const maybe = value as TgpuRenderPipeline | undefined;
  return maybe?.resourceType === 'render-pipeline' && !!maybe[$internal];
}

export function isPipeline(
  value: unknown,
): value is TgpuComputePipeline | TgpuRenderPipeline {
  return isRenderPipeline(value) || isComputePipeline(value);
}
