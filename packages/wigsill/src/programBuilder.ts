import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import { ResolutionCtxImpl } from './resolutionCtx';
import type { BufferUsage, WgslResolvable } from './types';
import { isSamplerType } from './types';
import type { WgslSampler } from './wgslSampler';
import {
  type WgslTextureExternal,
  type WgslTextureView,
  isExternalTexture,
} from './wgslTexture';
import type WigsillRuntime from './wigsillRuntime';

export type Program = {
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;
  code: string;
};

type BuildOptions = {
  shaderStage: number;
  bindingGroup: number;
  nameRegistry?: NameRegistry;
};

const usageToBindingTypeMap: Record<BufferUsage, GPUBufferBindingType> = {
  uniform: 'uniform',
  mutable_storage: 'storage',
  readonly_storage: 'read-only-storage',
};

export default class ProgramBuilder {
  constructor(
    private runtime: WigsillRuntime,
    private root: WgslResolvable,
  ) {}

  build(options: BuildOptions): Program {
    const ctx = new ResolutionCtxImpl({
      names: options.nameRegistry ?? new RandomNameRegistry(),
      bindingGroup: options.bindingGroup,
    });

    // Resolving code
    const codeString = ctx.resolve(this.root);
    const usedBindables = Array.from(ctx.usedBindables);
    const usedRenderResources = Array.from(ctx.usedRenderResources);
    const usedSamplers = usedRenderResources.filter((resource) =>
      isSamplerType(resource.type),
    );
    const usedTextures = usedRenderResources.filter(
      (resource) =>
        !isSamplerType(resource.type) && !isExternalTexture(resource),
    );
    const usedExternalTextures = usedRenderResources.filter((resource) =>
      isExternalTexture(resource),
    );
    const allEntries = [];
    let idx = 0;
    for (const _ of usedTextures) {
      allEntries.push({
        binding: idx++,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        texture: {},
      });
    }
    for (const _ of usedExternalTextures) {
      allEntries.push({
        binding: idx++,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        externalTexture: {},
      });
    }
    for (const _ of usedSamplers) {
      allEntries.push({
        binding: idx++,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        sampler: {},
      });
    }
    for (const bindable of usedBindables) {
      allEntries.push({
        binding: idx++,
        visibility: options.shaderStage,
        buffer: {
          type: usageToBindingTypeMap[bindable.usage],
        },
      });
    }

    const bindGroupLayout = this.runtime.device.createBindGroupLayout({
      entries: allEntries,
    });

    const allBindGroupEntries = [];
    idx = 0;
    for (const texture of usedTextures) {
      allBindGroupEntries.push({
        binding: idx++,
        resource: this.runtime.textureFor(texture as WgslTextureView),
      });
    }
    for (const externalTexture of usedExternalTextures) {
      allBindGroupEntries.push({
        binding: idx++,
        resource: this.runtime.externalTextureFor(
          externalTexture as WgslTextureExternal,
        ),
      });
    }
    for (const sampler of usedSamplers) {
      allBindGroupEntries.push({
        binding: idx++,
        resource: this.runtime.samplerFor(sampler as WgslSampler),
      });
    }
    for (const bindable of usedBindables) {
      allBindGroupEntries.push({
        binding: idx++,
        resource: {
          buffer: this.runtime.bufferFor(bindable.allocatable),
        },
      });
    }

    const bindGroup = this.runtime.device.createBindGroup({
      layout: bindGroupLayout,
      entries: allBindGroupEntries as Iterable<GPUBindGroupEntry>,
    });

    return {
      bindGroupLayout,
      bindGroup,
      code: codeString,
    };
  }
}
