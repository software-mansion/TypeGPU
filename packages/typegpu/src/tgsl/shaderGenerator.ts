import type { Block, Expression, Statement } from 'tinyest';
import type { AnyData } from '../data/dataTypes.ts';
import type { Snippet } from '../data/snippet.ts';
import type { GenerationCtx } from './generationHelpers.ts';

export interface FunctionHeaderOptions {
  type: 'normal' | 'vertex' | 'fragment' | 'compute';
  /**
   * Only applicable to 'compute' entry functions
   */
  workgroupSize?: [number, number?, number?] | undefined;
  id: string;
  args: Snippet[];
  returnType: AnyData;
}

export interface FunctionBodyOptions {
  type: 'normal' | 'vertex' | 'fragment' | 'compute';
  /**
   * Only applicable to 'compute' entry functions
   */
  workgroupSize?: [number, number?, number?] | undefined;
  id: string;
  args: Snippet[];
  returnType: AnyData | undefined;
  bodyNode: Block;
}

export interface ShaderGenerator {
  initGenerator(ctx: GenerationCtx): void;
  block(body: Block): string;
  identifier(id: string): Snippet;
  typedExpression(expression: Expression, expectedType: AnyData): Snippet;
  expression(expression: Expression): Snippet;
  statement(statement: Statement): string;
  functionHeader(options: FunctionHeaderOptions): string;
  functionBody(options: FunctionBodyOptions): string;
}
