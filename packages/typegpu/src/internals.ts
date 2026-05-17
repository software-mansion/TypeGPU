// Each export here is available as a member on the 'typegpu/~internals` import.

export { abstractInt, abstractFloat } from './data/numeric.ts';
export { UnknownData } from './data/dataTypes.ts';
export { getName } from './shared/meta.ts';
export { makeDereferencable } from './tgsl/makeDereferencable.ts';
export { makeResolvable } from './tgsl/makeResolvable.ts';
export { WgslGenerator } from './tgsl/wgslGenerator.ts';
export { snip } from './data/snippet.ts';

// types
export type { ResolutionCtx, FunctionArgument, TgpuShaderStage } from './types.ts';
export type { Snippet, ResolvedSnippet, Origin } from './data/snippet.ts';

export type { ShaderGenerator, FunctionDefinitionOptions } from './tgsl/shaderGenerator.ts';
