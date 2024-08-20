import type { SimpleWgslData } from './data';
import type { ResolutionCtxImpl } from './resolutionCtx';
import { deriveVertexFormat } from './typegpuRuntime';
import type { TypeGpuRuntime } from './typegpuRuntime';
import type { AnyWgslData, BufferUsage, WgslBindable } from './types';
import { type WgslSampler, isSampler } from './wgslSampler';
import {
  type WgslAnyTextureView,
  type WgslTextureExternal,
  isExternalTexture,
  isTextureView,
} from './wgslTexture';

const usageToBindingTypeMap: Record<
  Exclude<BufferUsage, 'vertex'>,
  GPUBufferBindingType
> = {
  uniform: 'uniform',
  mutable: 'storage',
  readonly: 'read-only-storage',
};

export class BindGroupResolver {
  private samplers: WgslSampler[] = [];
  private textureViews: WgslAnyTextureView[] = [];
  private externalTextures: WgslTextureExternal[] = [];
  private buffers: WgslBindable<AnyWgslData, BufferUsage>[] = [];
  private vertexBuffers: Map<
    WgslBindable<AnyWgslData, 'vertex'>,
    number
  > | null = null;

  private layout: GPUBindGroupLayout | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private vertexLayout: GPUVertexBufferLayout[] | null = null;

  constructor(
    private runtime: TypeGpuRuntime,
    private context: ResolutionCtxImpl,
    public readonly shaderStage: number,
  ) {
    const renderResources = Array.from(context.usedRenderResources);
    for (const resource of renderResources) {
      if (isSampler(resource)) {
        this.samplers.push(resource);
      } else if (isTextureView(resource)) {
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
      buffer: WgslBindable<AnyWgslData, 'vertex'>;
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
      if (textureView.access === undefined) {
        entries.push({
          binding: this.context.getIndexFor(textureView),
          visibility: this.shaderStage,
          texture: {},
        });
      } else {
        entries.push({
          binding: this.context.getIndexFor(textureView),
          visibility: this.shaderStage,
          storageTexture: { format: textureView.texture.descriptor.format },
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
    const layout = this.runtime.device.createBindGroupLayout({
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
        resource: this.runtime.viewFor(textureView),
      });
    }
    for (const external of this.externalTextures) {
      entries.push({
        binding: this.context.getIndexFor(external),
        resource: this.runtime.externalTextureFor(external),
      });
    }
    for (const sampler of this.samplers) {
      entries.push({
        binding: this.context.getIndexFor(sampler),
        resource: this.runtime.samplerFor(sampler),
      });
    }
    for (const buffer of this.buffers) {
      if (buffer.usage === 'vertex') continue;
      entries.push({
        binding: this.context.getIndexFor(buffer),
        resource: {
          buffer: this.runtime.bufferFor(buffer.allocatable),
        },
      });
    }
    const bindGroup = this.runtime.device.createBindGroup({
      layout: this.getBindGroupLayout(),
      entries,
    });

    if (this.externalTextures.length === 0) {
      this.bindGroup = bindGroup;
    }
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
      if (!buffer.allocatable.vertexLayout) {
        throw new Error(
          `Buffer ${buffer.allocatable} does not have a vertex layout`,
        );
      }
      vertexBufferDescriptors.push({
        ...buffer.allocatable.vertexLayout,
        attributes: [
          {
            shaderLocation: idx,
            offset: 0,
            format: deriveVertexFormat(
              buffer.allocatable.dataType as SimpleWgslData<AnyWgslData>,
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

  getVertexBufferIndex(buffer: WgslBindable<AnyWgslData, 'vertex'>) {
    const index = this.vertexBuffers?.get(buffer);
    if (this.vertexBuffers === null || index === undefined) {
      throw new Error('Vertex buffers not set');
    }
    return index;
  }
}
