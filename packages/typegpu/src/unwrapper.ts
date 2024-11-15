import type { TgpuBuffer } from './core/buffer/buffer';
import type { TgpuComputePipeline } from './core/pipeline/computePipeline';
import type {
  TgpuMutableTexture,
  TgpuReadonlyTexture,
  TgpuSampledTexture,
  TgpuTexture,
  TgpuWriteonlyTexture,
} from './core/texture/texture';
import type { TgpuBindGroup, TgpuBindGroupLayout } from './tgpuBindGroupLayout';
import type { AnyTgpuData } from './types';

export interface Unwrapper {
  readonly device: GPUDevice;
  unwrap(resource: TgpuComputePipeline): GPUComputePipeline;
  unwrap(resource: TgpuBindGroupLayout): GPUBindGroupLayout;
  unwrap(resource: TgpuBindGroup): GPUBindGroup;
  unwrap(resource: TgpuBuffer<AnyTgpuData>): GPUBuffer;
  unwrap(resource: TgpuTexture): GPUTexture;
  unwrap(
    resource:
      | TgpuReadonlyTexture
      | TgpuWriteonlyTexture
      | TgpuMutableTexture
      | TgpuSampledTexture,
  ): GPUTextureView;
}
