import type { Block, Expression, Statement } from 'tinyest';
import type { AnyData } from '../data/dataTypes.ts';
import type { Snippet } from '../data/snippet.ts';
import type { GenerationCtx } from './generationHelpers.ts';

export interface FunctionDefinitionExtra {
  type: 'normal' | 'vertex' | 'fragment' | 'compute';
  /**
   * Only applicable to 'compute' entry functions
   */
  workgroupSize?: number[] | undefined;
}

export interface ShaderGenerator {
  initGenerator(ctx: GenerationCtx): void;
  block(body: Block): string;
  identifier(id: string): Snippet;
  typedExpression(expression: Expression, expectedType: AnyData): Snippet;
  expression(expression: Expression): Snippet;
  statement(statement: Statement): string;
  functionHeader(options: ShaderGenerator.FunctionHeaderOptions): string;
  functionBody(options: Block): string;
}

export namespace ShaderGenerator {
  export interface FunctionHeaderOptions extends FunctionDefinitionExtra {
    id: string;
    args: Snippet[];
    /**
     * The return type of the function.
     */
    returnType: AnyData;
  }
}
