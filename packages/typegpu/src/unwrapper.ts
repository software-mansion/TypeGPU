import type { TgpuQuerySet } from './core/querySet/querySet.ts';
import type { TgpuBuffer } from './core/buffer/buffer.ts';
import type { TgpuComputePipeline } from './core/pipeline/computePipeline.ts';
import type { TgpuRenderPipeline } from './core/pipeline/renderPipeline.ts';
import type {
  TgpuComparisonSampler,
  TgpuSampler,
} from './core/sampler/sampler.ts';
import type {
  TgpuMutableTexture,
  TgpuReadonlyTexture,
  TgpuSampledTexture,
  TgpuTexture,
  TgpuWriteonlyTexture,
} from './core/texture/texture.ts';
import type { TgpuVertexLayout } from './core/vertexLayout/vertexLayout.ts';
import type { AnyData } from './data/dataTypes.ts';
import type {
  TgpuBindGroup,
  TgpuBindGroupLayout,
} from './tgpuBindGroupLayout.ts';

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
  unwrap(resource: TgpuSampler): GPUSampler;
  unwrap(resource: TgpuComparisonSampler): GPUSampler;
  unwrap(resource: TgpuQuerySet<GPUQueryType>): GPUQuerySet;
}
