// Each export here is available as a member on the 'typegpu/~internals` import.

export { UnknownData } from './data/dataTypes.ts';
export { getName } from './shared/meta.ts';
export { makeDereferencable } from './tgsl/makeDereferencable.ts';
export { makeResolvable } from './tgsl/makeResolvable.ts';
export { AutoFragmentFn, AutoVertexFn } from './core/function/autoIO.ts';
export { WgslGenerator } from './tgsl/wgslGenerator.ts';
// TODO(#2410): Required for @typegpu/gl, but should be replaced with a proper API
export { writeData, readData } from './data/dataIO.ts';

// types
export type { ResolutionCtx, FunctionArgument, TgpuShaderStage } from './types.ts';
export type { Snippet, Origin } from './data/snippet.ts';

export type { ShaderGenerator, FunctionDefinitionOptions } from './tgsl/shaderGenerator.ts';
