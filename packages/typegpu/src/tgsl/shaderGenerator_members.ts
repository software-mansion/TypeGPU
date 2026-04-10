import type { Block } from 'tinyest';
import type { BaseData } from '../data/wgslTypes.ts';
import type { FunctionArgument, TgpuShaderStage } from '../types.ts';

export { UnknownData } from '../data/dataTypes.ts';

// types
export type { ResolutionCtx, FunctionArgument } from '../types.ts';

export interface FunctionDefinitionOptions {
  readonly functionType: 'normal' | TgpuShaderStage;
  readonly args: readonly FunctionArgument[];
  readonly body: Block;

  determineReturnType(): BaseData;
}
