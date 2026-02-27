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

export function isGPUCommandEncoder(
  value: unknown,
): value is GPUCommandEncoder {
  return (
    !!value &&
    typeof value === 'object' &&
    'beginRenderPass' in value &&
    'beginComputePass' in value
  );
}

export function isGPUComputePassEncoder(
  value: unknown,
): value is GPUComputePassEncoder {
  return (
    !!value &&
    typeof value === 'object' &&
    'dispatchWorkgroups' in value &&
    !('beginRenderPass' in value)
  );
}

export function isGPURenderPassEncoder(
  value: unknown,
): value is GPURenderPassEncoder {
  return (
    !!value &&
    typeof value === 'object' &&
    'executeBundles' in value &&
    'draw' in value
  );
}

export function isGPURenderBundleEncoder(
  value: unknown,
): value is GPURenderBundleEncoder {
  return (
    !!value &&
    typeof value === 'object' &&
    'draw' in value &&
    'finish' in value &&
    !('executeBundles' in value) &&
    !('beginRenderPass' in value) &&
    !('dispatchWorkgroups' in value)
  );
}
