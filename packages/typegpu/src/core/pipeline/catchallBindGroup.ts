import type { ResolutionCtxImpl } from '../../resolutionCtx';
import { type TgpuSampler, isSampler } from '../../tgpuSampler';
import {
  type TgpuAnyTextureView,
  type TgpuTextureExternal,
  isExternalTexture,
  isTextureView,
} from '../../tgpuTexture';
import type { AnyTgpuData, BufferUsage, TgpuBindable } from '../../types';
import type { ExperimentalTgpuRoot } from '../root/rootTypes';

const usageToBindingTypeMap: Record<
  Exclude<BufferUsage, 'vertex'>,
  GPUBufferBindingType
> = {
  uniform: 'uniform',
  mutable: 'storage',
  readonly: 'read-only-storage',
};

export class CatchallBindGroup {
  private samplers: TgpuSampler[] = [];
  private textureViews: TgpuAnyTextureView[] = [];
  private externalTextures: TgpuTextureExternal[] = [];
  private buffers: TgpuBindable<AnyTgpuData, BufferUsage>[] = [];

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

  getBindGroupLayout(): GPUBindGroupLayout {
    if (this._layoutMemo) {
      return this._layoutMemo;
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
    const layout = this.root.device.createBindGroupLayout({
      entries,
    });
    this._layoutMemo = layout;

    return layout;
  }

  getBindGroup() {
    this.checkBindGroupInvalidation();

    if (this._bindGroupMemo) {
      return this._bindGroupMemo;
    }

    const entries: GPUBindGroupEntry[] = [];
    for (const textureView of this.textureViews) {
      entries.push({
        binding: this.context.getIndexFor(textureView),
        resource: this.root.viewFor(textureView),
      });
    }
    for (const external of this.externalTextures) {
      entries.push({
        binding: this.context.getIndexFor(external),
        resource: this.root.externalTextureFor(external),
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

  invalidateBindGroup() {
    this._bindGroupMemo = null;
  }

  checkBindGroupInvalidation() {
    for (const texture of this.externalTextures) {
      // check if texture is dirty (changed source) -> if so, invalidate bind group and mark clean
      if (this.root.isDirty(texture)) {
        this.invalidateBindGroup();
        this.root.markClean(texture);
        continue;
      }

      // check if any external texture is of type HTMLVideoElement -> if so, invalidate bind group as it expires on bind
      if (texture.source instanceof HTMLVideoElement) {
        this.invalidateBindGroup();
      }
    }
  }
}
