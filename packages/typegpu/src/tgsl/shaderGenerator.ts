import type { Block } from 'tinyest';
import type { BaseData } from '../data/wgslTypes.ts';
import type { GenerationCtx } from './generationHelpers.ts';
import type { ResolvedSnippet, Snippet } from '../data/snippet.ts';

/**
 * **NOTE: This is an unstable API and may change in the future.**
 *
 * An interface meant to be used by other systems to generate snippets of
 * shader code in the target language (WGSL, GLSL, etc.).
 */
export interface ShaderGenerator {
  initGenerator(ctx: GenerationCtx): void;

  functionDefinition(body: Block): string;
  typeInstantiation(schema: BaseData, args: readonly Snippet[]): ResolvedSnippet;
  typeAnnotation(schema: BaseData): string;
}

export * as ShaderGenerator from './shaderGenerator_members.ts';
