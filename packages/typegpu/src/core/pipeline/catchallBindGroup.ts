import type { ResolutionCtxImpl } from '../../resolutionCtx';
import type { AnyTgpuData, BufferUsage } from '../../types';
import type { TgpuBufferUsage } from '../buffer/bufferUsage';
import type { ExperimentalTgpuRoot } from '../root/rootTypes';
import type { TgpuAnyTextureView } from '../texture/texture';

const usageToBindingTypeMap: Record<
  Exclude<BufferUsage, 'vertex'>,
  GPUBufferBindingType
> = {
  uniform: 'uniform',
  mutable: 'storage',
  readonly: 'read-only-storage',
};

export class CatchallBindGroup {
  private textureViews: TgpuAnyTextureView[] = [];
  private buffers: TgpuBufferUsage<AnyTgpuData>[] = [];

  private _layoutMemo: GPUBindGroupLayout | null = null;
  private _bindGroupMemo: GPUBindGroup | null = null;

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

  getBindGroupLayout(): GPUBindGroupLayout {
    if (this._layoutMemo) {
      return this._layoutMemo;
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
    this._layoutMemo = layout;

    return layout;
  }

  getBindGroup() {
    if (this._bindGroupMemo) {
      return this._bindGroupMemo;
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

    this._bindGroupMemo = bindGroup;
    return bindGroup;
  }
}
