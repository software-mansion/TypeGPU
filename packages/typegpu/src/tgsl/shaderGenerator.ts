import type { Block, Expression, Statement } from 'tinyest';
import type { AnyData } from '../data/dataTypes.ts';
import type { Snippet } from '../data/snippet.ts';
import type { GenerationCtx } from './generationHelpers.ts';
import type { ResolutionCtx as $ResolutionCtx, ShaderStage } from '../types.ts';

export interface FunctionDefinitionExtra {
  type: 'normal' | ShaderStage;
  /**
   * Only applicable to 'compute' entry functions
   */
  workgroupSize?: number[] | undefined;
  bodyNode: Block;
}

export interface ShaderGenerator {
  initGenerator(ctx: GenerationCtx): void;
  block(body: Block): string;
  identifier(id: string): Snippet;
  typedExpression(expression: Expression, expectedType: AnyData): Snippet;
  expression(expression: Expression): Snippet;
  statement(statement: Statement): string;
  functionDefinition(
    options: ShaderGenerator.FunctionDefinitionOptions,
  ): string;
  functionBody(body: Block): string;
}

export declare namespace ShaderGenerator {
  type ResolutionCtx = $ResolutionCtx;
  interface FunctionDefinitionOptions extends FunctionDefinitionExtra {
    id: string;
    args: Snippet[];
    /**
     * The return type of the function.
     */
    returnType?: AnyData | undefined;
  }
}
