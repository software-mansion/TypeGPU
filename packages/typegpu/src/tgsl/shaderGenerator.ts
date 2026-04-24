import type { Block } from 'tinyest';
import type { BaseData } from '../data/wgslTypes.ts';
import type { GenerationCtx } from './generationHelpers.ts';
import type { ResolvedSnippet, Snippet } from '../data/snippet.ts';
import type { VariableScope } from '../core/variable/tgpuVariable.ts';
import type { BindableBufferUsage, FunctionArgument, TgpuShaderStage } from '../types.ts';

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
  readonly scope: VariableScope | BindableBufferUsage;
  readonly id: string;
  readonly dataType: BaseData;
  readonly init: Snippet | undefined;
  readonly group?: string | undefined;
  readonly binding?: number | undefined;
}

/**
 * **NOTE: This is an unstable API and may change in the future.**
 *
 * An interface meant to be used by other systems to generate snippets of
 * shader code in the target language (WGSL, GLSL, etc.).
 */
export interface ShaderGenerator {
  initGenerator(ctx: GenerationCtx): void;

  declareGlobalConst(options: ConstantDefinitionOptions): ResolvedSnippet;
  declareGlobalVar(options: VariableDefinitionOptions): ResolvedSnippet;
  functionDefinition(options: FunctionDefinitionOptions): string;

  typeInstantiation(schema: BaseData, args: readonly Snippet[]): ResolvedSnippet;
  typeAnnotation(schema: BaseData): string;
}
