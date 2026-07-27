import { $internal } from '../../shared/symbols.ts';
import type { TgpuCommandEncoder } from '../commandEncoder/commandEncoder.ts';
import type { TgpuComputePass } from '../commandEncoder/computePass.ts';
import type { TgpuRenderCommands, TgpuRenderPass } from '../commandEncoder/renderPass.ts';
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

export function isTgpuCommandEncoder(value: unknown): value is TgpuCommandEncoder {
  const maybe = value as TgpuCommandEncoder | undefined;
  return maybe?.resourceType === 'command-encoder' && !!maybe[$internal];
}

export function isTgpuRenderPass(value: unknown): value is TgpuRenderPass {
  const maybe = value as TgpuRenderPass | undefined;
  return maybe?.resourceType === 'render-pass' && !!maybe[$internal];
}

export function isTgpuRenderCommands(value: unknown): value is TgpuRenderCommands {
  const maybe = value as TgpuRenderCommands | undefined;
  return (
    (maybe?.resourceType === 'render-pass' || maybe?.resourceType === 'render-bundle-pass') &&
    !!maybe[$internal]
  );
}

export function isTgpuComputePass(value: unknown): value is TgpuComputePass {
  const maybe = value as TgpuComputePass | undefined;
  return maybe?.resourceType === 'compute-pass' && !!maybe[$internal];
}

export function isGPUCanvasContext(value: unknown): value is GPUCanvasContext {
  return typeof (value as GPUCanvasContext)?.getCurrentTexture === 'function';
}

export function isGPUCommandEncoder(value: unknown): value is GPUCommandEncoder {
  return (
    !!value &&
    typeof value === 'object' &&
    'beginRenderPass' in value &&
    'beginComputePass' in value
  );
}

export function isGPUComputePassEncoder(value: unknown): value is GPUComputePassEncoder {
  return (
    !!value &&
    typeof value === 'object' &&
    'dispatchWorkgroups' in value &&
    !('beginRenderPass' in value)
  );
}

export function isGPURenderPassEncoder(value: unknown): value is GPURenderPassEncoder {
  return !!value && typeof value === 'object' && 'executeBundles' in value && 'draw' in value;
}

export function isGPURenderBundleEncoder(value: unknown): value is GPURenderBundleEncoder {
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
