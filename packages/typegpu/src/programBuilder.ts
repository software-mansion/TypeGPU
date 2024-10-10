import { BindGroupResolver } from './bindGroupResolver';
import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import { ResolutionCtxImpl } from './resolutionCtx';
import type { TgpuRoot } from './tgpuRoot';
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
    private root: TgpuRoot,
    private rootNode: TgpuResolvable,
  ) {}

  build(options: BuildOptions): Program {
    const ctx = new ResolutionCtxImpl({
      names: options.nameRegistry ?? new RandomNameRegistry(),
      bindingGroup: options.bindingGroup,
      jitTranspiler: this.root.jitTranspiler,
    });

    // Resolving code
    const codeString = ctx.resolve(this.rootNode);

    return {
      bindGroupResolver: new BindGroupResolver(
        this.root,
        ctx,
        options.shaderStage,
      ),
      code: codeString,
    };
  }
}
