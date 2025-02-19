import type { TgpuBuffer } from './core/buffer/buffer';
import type { TgpuComputePipeline } from './core/pipeline/computePipeline';
import type { TgpuRenderPipeline } from './core/pipeline/renderPipeline';
import type {
  TgpuMutableTexture,
  TgpuReadonlyTexture,
  TgpuSampledTexture,
  TgpuTexture,
  TgpuWriteonlyTexture,
} from './core/texture/texture';
import type { TgpuVertexLayout } from './core/vertexLayout/vertexLayout';
import type { AnyData } from './data/dataTypes';
import type { TgpuBindGroup, TgpuBindGroupLayout } from './tgpuBindGroupLayout';

export interface Unwrapper {
  readonly device: GPUDevice;
  unwrap(resource: TgpuComputePipeline): GPUComputePipeline;
  unwrap(resource: TgpuRenderPipeline): GPURenderPipeline;
  unwrap(resource: TgpuBindGroupLayout): GPUBindGroupLayout;
  unwrap(resource: TgpuBindGroup): GPUBindGroup;
  unwrap(resource: TgpuBuffer<AnyData>): GPUBuffer;
  unwrap(resource: TgpuTexture): GPUTexture;
  unwrap(
    resource:
      | TgpuReadonlyTexture
      | TgpuWriteonlyTexture
      | TgpuMutableTexture
      | TgpuSampledTexture,
  ): GPUTextureView;
  unwrap(resource: TgpuVertexLayout): GPUVertexBufferLayout;
}
