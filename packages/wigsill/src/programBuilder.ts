import type { MemoryArena } from './memoryArena';
import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import { ResolutionCtxImpl } from './resolutionCtx';
import type { WgslResolvable } from './types';
import type WigsillRuntime from './wigsillRuntime';

export type Program = {
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;
  code: string;
};

function addUnique<T>(list: T[], value: T) {
  if (list.includes(value)) {
    return;
  }

  list.push(value);
}

type BuildOptions = {
  shaderStage: number;
  bindingGroup: number;
  arenas?: MemoryArena[];
  nameRegistry?: NameRegistry;
};

export default class ProgramBuilder {
  constructor(
    private runtime: WigsillRuntime,
    private root: WgslResolvable,
  ) {}

  build(options: BuildOptions): Program {
    const arenas = options.arenas ?? [];

    const ctx = new ResolutionCtxImpl({
      memoryArenas: arenas,
      names: options.nameRegistry ?? new RandomNameRegistry(),
    });

    // Resolving code
    const codeString = ctx.resolve(this.root);

    const bindGroupLayout = this.runtime.device.createBindGroupLayout({
      // TODO: Fix this
      entries: [],
    });

    const bindGroup = this.runtime.device.createBindGroup({
      layout: bindGroupLayout,
      // TODO: Fix this
      entries: [],
    });

    return {
      bindGroupLayout,
      bindGroup,
      code: codeString,
    };
  }
}
