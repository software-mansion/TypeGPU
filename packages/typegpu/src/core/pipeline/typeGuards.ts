import { $internal } from '../../shared/symbols.ts';
import type { TgpuComputePipeline } from './computePipeline.ts';
import type { TgpuRenderPipeline } from './renderPipeline.ts';

export function isComputePipeline(value: unknown): value is TgpuComputePipeline {
  const maybe = value as TgpuComputePipeline | undefined;
  return maybe?.resourceType === 'compute-pipeline' && !!maybe[$internal];
}

export function isRenderPipeline(value: unknown): value is TgpuRenderPipeline {
  const maybe = value as TgpuRenderPipeline | undefined;
  return maybe?.resourceType === 'render-pipeline' && !!maybe[$internal];
}

export function isPipeline(value: unknown): value is TgpuComputePipeline | TgpuRenderPipeline {
  return isRenderPipeline(value) || isComputePipeline(value);
}

export function isGPUCommandEncoder(value: unknown): value is GPUCommandEncoder {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as GPUCommandEncoder).beginRenderPass === 'function' &&
    typeof (value as GPUCommandEncoder).beginComputePass === 'function'
  );
}

export function isGPUComputePassEncoder(value: unknown): value is GPUComputePassEncoder {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as GPUComputePassEncoder).dispatchWorkgroups === 'function' &&
    typeof (value as GPUCommandEncoder).beginRenderPass !== 'function'
  );
}

export function isGPURenderPassEncoder(value: unknown): value is GPURenderPassEncoder {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as GPURenderPassEncoder).executeBundles === 'function' &&
    typeof (value as GPURenderPassEncoder).draw === 'function'
  );
}

export function isGPURenderBundleEncoder(value: unknown): value is GPURenderBundleEncoder {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as GPURenderBundleEncoder).draw === 'function' &&
    typeof (value as GPURenderBundleEncoder).finish === 'function' &&
    typeof (value as GPURenderPassEncoder).executeBundles !== 'function' &&
    typeof (value as GPUCommandEncoder).beginRenderPass !== 'function' &&
    typeof (value as GPUComputePassEncoder).dispatchWorkgroups !== 'function'
  );
}
