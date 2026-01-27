import type { Block, Expression, Statement } from 'tinyest';
import type { Snippet } from '../data/snippet.ts';
import type { GenerationCtx } from './generationHelpers.ts';
import type { BaseData } from '../data/wgslTypes.ts';

export interface ShaderGenerator {
  initGenerator(ctx: GenerationCtx): void;
  block(body: Block): string;
  identifier(id: string): Snippet;
  typedExpression(expression: Expression, expectedType: BaseData): Snippet;
  expression(expression: Expression): Snippet;
  statement(statement: Statement): string;
  functionDefinition(body: Block): string;
}
