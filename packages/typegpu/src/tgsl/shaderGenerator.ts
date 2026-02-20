import type { Block, Expression, Statement } from 'tinyest';
import type { ExternalMap } from '../../src/core/resolve/externals.ts';
import type { Snippet } from '../data/snippet.ts';
import type { BaseData } from '../data/wgslTypes.ts';
import type { GenerationCtx } from './generationHelpers.ts';

export interface ShaderGenerator {
  initGenerator(ctx: GenerationCtx): void;
  block(body: Block, externalMap?: ExternalMap): string;
  identifier(id: string): Snippet;
  typedExpression(expression: Expression, expectedType: BaseData): Snippet;
  expression(expression: Expression): Snippet;
  statement(statement: Statement): string;
  functionDefinition(body: Block): string;
}
