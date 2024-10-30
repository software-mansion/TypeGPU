import { BindGroupResolver } from './bindGroupResolver';
import type { ExperimentalTgpuRoot } from './core/root/rootTypes';
import { type NameRegistry, RandomNameRegistry } from './nameRegistry';
import { ResolutionCtxImpl } from './resolutionCtx';
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
    private root: ExperimentalTgpuRoot,
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
