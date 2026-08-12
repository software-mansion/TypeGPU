// Each export here is available as a member on the 'typegpu/~internal' import.

export { abstractInt, abstractFloat } from './data/numeric.ts';
export { makeResolvable } from './tgsl/makeResolvable.ts';
export { makeDereferenceable } from './tgsl/makeDereferenceable.ts';
export { UnknownData } from './data/dataTypes.ts';
export { getName, setName } from './shared/meta.ts';
export { WgslGenerator } from './tgsl/wgslGenerator.ts';
export { snip, withValue, withDataType, withSideEffects } from './data/snippet.ts';
export { stringifyNode } from './shared/tseynit.ts';
export { dualImpl } from './core/function/dualImpl.ts';
export {
  isNonTransferableResource,
  isTransferableResource,
  restoreResource,
  snapshotResource,
} from './serial/registry.ts';
export type { TgpuResourceSnapshot, TransferableResourceType } from './serial/registry.ts';
export type { RestoreContext } from './serial/types.ts';
export {
  deserializeDataSchema,
  serializeDataSchema,
  type SerializedDataSchema,
} from './serial/schema.ts';

// types
export type { ResolutionCtx, FunctionArgument } from './types.ts';
export type { Snippet, ResolvedSnippet, Origin } from './data/snippet.ts';

export type {
  ShaderGenerator,
  BinaryOperator,
  ShaderGeneratorClass,
  FunctionDefinitionOptions,
  ConstantDefinitionOptions,
  VariableDefinitionOptions,
} from './tgsl/shaderGenerator.ts';
