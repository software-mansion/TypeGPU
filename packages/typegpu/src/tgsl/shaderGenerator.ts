import type { Block } from 'tinyest';
import type { BaseData } from '../data/wgslTypes.ts';
import type { ResolvedSnippet, Snippet } from '../data/snippet.ts';
import type { VariableScope } from '../core/variable/tgpuVariable.ts';
import type {
  BindableBufferUsage,
  FunctionArgument,
  ResolutionCtx,
  ShaderStage,
} from '../types.ts';

export interface FunctionDefinitionOptions {
  readonly functionType: 'normal' | ShaderStage;
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
  readonly scope: VariableScope | BindableBufferUsage | 'handle';
  readonly id: string;
  readonly dataType: BaseData;
  readonly init: Snippet | undefined;
  readonly group?: string | undefined;
  readonly binding?: number | undefined;
}

/**
 * **NOTE: This is an unstable API and may change in the future.**
 *
 * Used to instantiate generators, once per resolution context
 */
export interface ShaderGeneratorClass<T extends ShaderGenerator = ShaderGenerator> {
  new (): T;
}

/**
 * Represents generators that, once instantiated, will generate `wgsl` (as opposed to e.g. `glsl`)
 */
export type WgslGeneratorClass = ShaderGeneratorClass<ShaderGenerator & { languageKey: 'wgsl' }>;

/**
 * **NOTE: This is an unstable API and may change in the future.**
 *
 * An interface meant to be used by other systems to generate snippets of
 * shader code in the target language (WGSL, GLSL, etc.).
 */
export interface ShaderGenerator {
  readonly languageKey: string;

  initGenerator(ctx: ResolutionCtx): void;

  declareGlobalConst(options: ConstantDefinitionOptions): ResolvedSnippet;
  declareGlobalVar(options: VariableDefinitionOptions): ResolvedSnippet;
  functionDefinition(options: FunctionDefinitionOptions): string;

  typeInstantiation(schema: BaseData, args: readonly Snippet[]): ResolvedSnippet;
  numericLiteral(value: number, schema: BaseData): ResolvedSnippet;
  typeAnnotation(schema: BaseData): string;
  call(name: string, templateParams: readonly Snippet[], args: readonly Snippet[]): string;
}
