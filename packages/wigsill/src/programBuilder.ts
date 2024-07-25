import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import { ResolutionCtxImpl } from './resolutionCtx';
import type { BufferUsage, WgslResolvable } from './types';
import type WigsillRuntime from './wigsillRuntime';
import { isSamplerType } from './types';

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
      (resource) => !isSamplerType(resource.type),
    );
    const allEntries = [];
    let idx = 0;
    for (const bindable of usedBindables) {
      allEntries.push({
        binding: idx++,
        visibility: options.shaderStage,
        buffer: {
          type: usageToBindingTypeMap[bindable.usage],
        },
      });
    }
    for (const sampler of usedSamplers) {
      allEntries.push({
        binding: idx++,
        visibility: options.shaderStage,
        sampler: {},
      });
    }
    for (const texture of usedTextures) {
      allEntries.push({
        binding: idx++,
        visibility: options.shaderStage,
        texture: {},
      });
    }

    const bindGroupLayout = this.runtime.device.createBindGroupLayout({
      entries: allEntries,
    });

    const allBindGroupEntries = [];
    idx = 0;
    for (const bindable of usedBindables) {
      allBindGroupEntries.push({
        binding: idx++,
        resource: {
          buffer: this.runtime.bufferFor(bindable.allocatable),
        },
      });
    }

    for (const sampler of usedSamplers) {
      allBindGroupEntries.push({
        binding: idx++,
        resource: sampler.

    const bindGroup = this.runtime.device.createBindGroup({
      layout: bindGroupLayout,
      entries: usedBindables.map((bindable, idx) => ({
        binding: idx,
        resource: {
          buffer: this.runtime.bufferFor(bindable.allocatable),
        },
      })),
    });

    return {
      bindGroupLayout,
      bindGroup,
      code: codeString,
    };
  }
}
