import { $internal, isMarkedInternal } from '../../shared/symbols.ts';
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
    (maybe?.resourceType === 'render-pass' || maybe?.resourceType === 'render-bundle-encoder') &&
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
  const maybe = value as GPUCommandEncoder | undefined;
  return (
    !isMarkedInternal(maybe) &&
    typeof maybe?.beginRenderPass === 'function' &&
    typeof maybe?.beginComputePass === 'function'
  );
}

export function isGPUComputePassEncoder(value: unknown): value is GPUComputePassEncoder {
  const maybe = value as (GPUComputePassEncoder & { beginRenderPass?: unknown }) | undefined;
  return (
    !isMarkedInternal(maybe) &&
    typeof maybe?.dispatchWorkgroups === 'function' &&
    maybe?.beginRenderPass === undefined
  );
}

export function isGPURenderPassEncoder(value: unknown): value is GPURenderPassEncoder {
  const maybe = value as GPURenderPassEncoder | undefined;
  return (
    !isMarkedInternal(maybe) &&
    typeof maybe?.executeBundles === 'function' &&
    typeof maybe?.draw === 'function'
  );
}

export function isGPURenderBundleEncoder(value: unknown): value is GPURenderBundleEncoder {
  const maybe = value as
    | (GPURenderBundleEncoder & {
        executeBundles?: unknown;
        beginRenderPass?: unknown;
        dispatchWorkgroups?: unknown;
      })
    | undefined;
  return (
    !isMarkedInternal(maybe) &&
    typeof maybe?.draw === 'function' &&
    typeof maybe?.finish === 'function' &&
    maybe?.executeBundles === undefined &&
    maybe?.beginRenderPass === undefined &&
    maybe?.dispatchWorkgroups === undefined
  );
}
