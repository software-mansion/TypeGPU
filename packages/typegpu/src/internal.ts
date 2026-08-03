// Each export here is available as a member on the 'typegpu/~internal' import.

export { abstractInt, abstractFloat } from './data/numeric.ts';
export { UnknownData } from './data/dataTypes.ts';
export { getName } from './shared/meta.ts';
export { WgslGenerator } from './tgsl/wgslGenerator.ts';
export { snip } from './data/snippet.ts';

// types
export type { ResolutionCtx, FunctionArgument, TgpuShaderStage } from './types.ts';
export type { Snippet, ResolvedSnippet, Origin } from './data/snippet.ts';

export type {
  ShaderGenerator,
  FunctionDefinitionOptions,
  ConstantDefinitionOptions,
  VariableDefinitionOptions,
} from './tgsl/shaderGenerator.ts';
