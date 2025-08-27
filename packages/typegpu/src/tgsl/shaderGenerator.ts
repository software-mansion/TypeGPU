import type { Block, Expression, Statement } from 'tinyest';
import type { GenerationCtx } from './generationHelpers.ts';
import type { AnyData, UnknownData } from '../data/dataTypes.ts';
import type { AnyWgslData } from '../data/wgslTypes.ts';
import type { Snippet } from '../data/snippet.ts';

export interface ShaderGenerator {
  generateBlock(ctx: GenerationCtx, body: Block): string;
  registerBlockVariable(
    ctx: GenerationCtx,
    id: string,
    dataType: AnyWgslData | UnknownData,
  ): Snippet;
  generateIdentifier(ctx: GenerationCtx, id: string): Snippet;
  generateTypedExpression(
    ctx: GenerationCtx,
    expression: Expression,
    expectedType: AnyData,
  ): Snippet;
  generateExpression(ctx: GenerationCtx, expression: Expression): Snippet;
  generateStatement(ctx: GenerationCtx, statement: Statement): string;
  generateFunction(ctx: GenerationCtx, body: Block): string;
}
