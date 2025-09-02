import type { Block, Expression, Statement } from 'tinyest';
import type { AnyData } from '../data/dataTypes.ts';
import type { Snippet } from '../data/snippet.ts';
import type { GenerationCtx } from './generationHelpers.ts';

export interface ShaderGenerator {
  initGenerator(ctx: GenerationCtx): void;
  block(body: Block): string;
  identifier(id: string): Snippet;
  typedExpression(expression: Expression, expectedType: AnyData): Snippet;
  expression(expression: Expression): Snippet;
  statement(statement: Statement): string;
  functionDefinition(body: Block): string;
}
