import type { MemoryArena } from './memoryArena';
import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import { ResolutionCtxImpl } from './resolutionCtx';
import type { BindPair, WgslResolvable, WgslSlot } from './types';
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
  private bindings: BindPair<unknown>[] = [];

  constructor(
    private runtime: WigsillRuntime,
    private root: WgslResolvable,
  ) {}

  provide<T>(bindable: WgslSlot<T>, value: T) {
    this.bindings.push([bindable, value]);
    return this;
  }

  build(options: BuildOptions): Program {
    const arenas = options.arenas ?? [];

    const ctx = new ResolutionCtxImpl({
      memoryArenas: arenas,
      bindings: this.bindings,
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
