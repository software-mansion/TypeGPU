import type { Block } from 'tinyest';
import type { GenerationCtx } from './generationHelpers.ts';

export interface ShaderGenerator {
  functionDefinition(ctx: GenerationCtx, body: Block): string;
}
