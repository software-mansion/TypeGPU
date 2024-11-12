import type {
  TgpuBufferUsage,
  TgpuBufferVertex,
} from './core/buffer/bufferUsage';
import {
  type ExperimentalTgpuRoot,
  deriveVertexFormat,
} from './core/root/rootTypes';
import {
  type TgpuExternalTexture,
  isExternalTexture,
} from './core/texture/externalTexture';
import {
  type TgpuAnyTextureView,
  isSampledTextureView,
  isStorageTextureView,
} from './core/texture/texture';
import type { ResolutionCtxImpl } from './resolutionCtx';
import { type TgpuSampler, isSampler } from './tgpuSampler';
import type { AnyTgpuData, BufferUsage, TgpuData } from './types';

const usageToBindingTypeMap: Record<
  Exclude<BufferUsage, 'vertex'>,
  GPUBufferBindingType
> = {
  uniform: 'uniform',
  mutable: 'storage',
  readonly: 'read-only-storage',
};

export class BindGroupResolver {
  private samplers: TgpuSampler[] = [];
  private textureViews: TgpuAnyTextureView[] = [];
  private externalTextures: TgpuExternalTexture[] = [];
  private buffers: TgpuBufferUsage<AnyTgpuData>[] = [];
  private vertexBuffers: Map<TgpuBufferVertex<AnyTgpuData>, number> | null =
    null;

  private layout: GPUBindGroupLayout | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private vertexLayout: GPUVertexBufferLayout[] | null = null;

  constructor(
    private root: ExperimentalTgpuRoot,
    private context: ResolutionCtxImpl,
    public readonly shaderStage: number,
  ) {
    const renderResources = Array.from(context.usedRenderResources);
    for (const resource of renderResources) {
      if (isSampler(resource)) {
        this.samplers.push(resource);
      } else if (
        isStorageTextureView(resource) ||
        isSampledTextureView(resource)
      ) {
        this.textureViews.push(resource);
      } else if (isExternalTexture(resource)) {
        this.externalTextures.push(resource);
      } else {
        throw new Error(`Invalid resource type: ${resource}`);
      }
    }
    this.buffers = Array.from(context.usedBindables);
  }

  setVertexBuffers(
    vertexBuffers: {
      index: number;
      buffer: TgpuBufferVertex<AnyTgpuData>;
    }[],
  ) {
    if (this.shaderStage !== GPUShaderStage.VERTEX) {
      throw new Error('Vertex buffers can only be set for vertex shader');
    }
    this.vertexBuffers = new Map(
      vertexBuffers.map(({ index, buffer }) => [buffer, index]),
    );
  }

  getBindGroupLayout() {
    if (this.layout) {
      return this.layout;
    }

    const entries: GPUBindGroupLayoutEntry[] = [];
    for (const textureView of this.textureViews) {
      if (textureView.resourceType === 'texture-sampled-view') {
        entries.push({
          binding: this.context.getIndexFor(textureView),
          visibility: this.shaderStage,
          texture: {},
        });
      } else {
        entries.push({
          binding: this.context.getIndexFor(textureView),
          visibility: this.shaderStage,
          storageTexture: { format: textureView.format },
        });
      }
    }
    for (const external of this.externalTextures) {
      entries.push({
        binding: this.context.getIndexFor(external),
        visibility: this.shaderStage,
        externalTexture: {},
      });
    }
    for (const sampler of this.samplers) {
      entries.push({
        binding: this.context.getIndexFor(sampler),
        visibility: this.shaderStage,
        sampler: {},
      });
    }
    for (const buffer of this.buffers) {
      if (buffer.usage === 'vertex') continue;
      entries.push({
        binding: this.context.getIndexFor(buffer),
        visibility: this.shaderStage,
        buffer: {
          type: usageToBindingTypeMap[buffer.usage],
        },
      });
    }
    const layout = this.root.device.createBindGroupLayout({
      entries,
    });
    this.layout = layout;
    return layout;
  }

  getBindGroup() {
    if (this.bindGroup) {
      return this.bindGroup;
    }

    const entries: GPUBindGroupEntry[] = [];
    for (const textureView of this.textureViews) {
      entries.push({
        binding: this.context.getIndexFor(textureView),
        resource: this.root.unwrap(textureView),
      });
    }
    for (const external of this.externalTextures) {
      entries.push({
        binding: this.context.getIndexFor(external),
        resource: this.root.unwrap(external),
      });
    }
    for (const sampler of this.samplers) {
      entries.push({
        binding: this.context.getIndexFor(sampler),
        resource: this.root.samplerFor(sampler),
      });
    }
    for (const buffer of this.buffers) {
      if (buffer.usage === 'vertex') continue;
      entries.push({
        binding: this.context.getIndexFor(buffer),
        resource: {
          buffer: buffer.allocatable.buffer,
        },
      });
    }
    const bindGroup = this.root.device.createBindGroup({
      layout: this.getBindGroupLayout(),
      entries,
    });

    this.bindGroup = bindGroup;
    return bindGroup;
  }

  getBindings() {
    return {
      bindGroupLayout: this.getBindGroupLayout(),
      bindGroup: this.getBindGroup(),
    };
  }

  getVertexBufferDescriptors() {
    if (this.vertexBuffers === null) {
      throw new Error('Vertex buffers not set');
    }

    if (this.vertexLayout) {
      return this.vertexLayout;
    }

    const vertexBufferDescriptors: GPUVertexBufferLayout[] = [];
    for (const [buffer, idx] of this.vertexBuffers.entries()) {
      vertexBufferDescriptors.push({
        ...buffer.vertexLayout,
        attributes: [
          {
            shaderLocation: idx,
            offset: 0,
            format: deriveVertexFormat(
              buffer.allocatable.dataType as TgpuData<AnyTgpuData>,
            ),
          },
        ],
      });
    }

    this.vertexLayout = vertexBufferDescriptors;
    return vertexBufferDescriptors;
  }

  getVertexBuffers() {
    if (this.vertexBuffers === null) {
      throw new Error('Vertex buffers not set');
    }
    return this.vertexBuffers.entries();
  }

  getVertexBufferIndex(buffer: TgpuBufferVertex<AnyTgpuData>) {
    const index = this.vertexBuffers?.get(buffer);
    if (this.vertexBuffers === null || index === undefined) {
      throw new Error('Vertex buffers not set');
    }
    return index;
  }

  invalidateBindGroup() {
    this.bindGroup = null;
  }
}
