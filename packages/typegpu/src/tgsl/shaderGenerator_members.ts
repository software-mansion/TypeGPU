import type { Block } from 'tinyest';
import type { BaseData } from '../data/wgslTypes.ts';
import type { BindableBufferUsage, FunctionArgument, TgpuShaderStage } from '../types.ts';
import type { VariableScope } from '../core/variable/tgpuVariable.ts';
import type { Snippet } from '../data/snippet.ts';

export { UnknownData } from '../data/dataTypes.ts';
export { getName } from '../shared/meta.ts';
export { makeDereferencable } from './makeDereferencable.ts';
export { makeResolvable } from './makeResolvable.ts';
export { AutoFragmentFn, AutoVertexFn } from '../core/function/autoIO.ts';
export { matchUpVaryingLocations } from '../core/pipeline/renderPipeline.ts';
export { valueProxyHandler } from '../core/valueProxyUtils.ts';
export { inCodegenMode } from '../execMode.ts';
export { $gpuValueOf, $internal, $ownSnippet, $resolve } from '../shared/symbols.ts';
export { snip } from '../data/snippet.ts';

// types
export type { ResolutionCtx, FunctionArgument, TgpuShaderStage } from '../types.ts';
export type { Snippet } from '../data/snippet.ts';
export type { Origin } from '../data/snippet.ts';

export interface FunctionDefinitionOptions {
  readonly functionType: 'normal' | TgpuShaderStage;
  readonly name: string;
  readonly workgroupSize?: readonly number[] | undefined;
  readonly args: readonly FunctionArgument[];
  readonly body: Block;

  determineReturnType(): BaseData;
}

export interface ConstantDefinitionOptions {
  readonly id: string;
  readonly dataType: BaseData;
  readonly init: Snippet;
}

export interface VariableDefinitionOptions {
  readonly scope: VariableScope | BindableBufferUsage | 'handle';
  readonly id: string;
  readonly dataType: BaseData;
  readonly init: Snippet | undefined;
  readonly group?: string | undefined;
  readonly binding?: number | undefined;
}
