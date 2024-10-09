import { BindGroupResolver } from './bindGroupResolver';
import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import { ResolutionCtxImpl } from './resolutionCtx';
import type { TgpuRuntime } from './tgpuRuntime';
import type { TgpuResolvable } from './types';

export type Program = {
  readonly bindGroupResolver: BindGroupResolver;
  readonly code: string;
};

type BuildOptions = {
  shaderStage: number;
  bindingGroup: number;
  nameRegistry?: NameRegistry;
};

export default class ProgramBuilder {
  constructor(
    private runtime: TgpuRuntime,
    private root: TgpuResolvable,
  ) {}

  build(options: BuildOptions): Program {
    const ctx = new ResolutionCtxImpl({
      names: options.nameRegistry ?? new RandomNameRegistry(),
      bindingGroup: options.bindingGroup,
      jitTranspiler: this.runtime.jitTranspiler,
    });

    // Resolving code
    const codeString = ctx.resolve(this.root);

    return {
      bindGroupResolver: new BindGroupResolver(
        this.runtime,
        ctx,
        options.shaderStage,
      ),
      code: codeString,
    };
  }
}
