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

export interface ResolvedStatement {
  code: string;
  /**
   * True if the statement (or statements) in `code` define variables that would
   * be scoped to the nearest block.
   */
  definesInNearestScope: boolean;
  /**
   * If not undefined, the execution of the statement (or statements) in `code`
   * *ends* in a control flow statement that will always cause the subsequent
   * statements to not be executed.
   *
   * For example, statements with code set to `return;`, `break;` and  `continue;`
   * will have this field set to 'return', 'break' and 'continue' respectively.
   * So will any sequence of statements that end with them, or `return value;`
   *
   * However, the statement `if (cond) { return; }` has `endsWithControlFlow` set to `undefined`,
   * because it's not guaranteed that including this code in a sequence will cause all
   * subsequent statements to be unreachable.
   */
  endsWithControlFlow?: 'return' | 'break' | 'continue' | undefined;
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
 * Binary operators that can appear in WGSL
 */
export type BinaryOperator =
  | '='
  | '^'
  | '|'
  | '&'
  | '*'
  | '/'
  | '%'
  | '+'
  | '-'
  | '<<'
  | '>>'
  | '<'
  | '>'
  | '<='
  | '>='
  | '=='
  | '!='
  | '&&'
  | '||'
  | '+='
  | '-='
  | '*='
  | '/='
  | '%='
  | '<<='
  | '>>='
  | '&='
  | '|='
  | '^=';

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

  isBannedToken(token: string): boolean;
  isBuiltinGlobal(identifier: string): boolean;

  declareGlobalConst(options: ConstantDefinitionOptions): ResolvedSnippet;
  declareGlobalVar(options: VariableDefinitionOptions): ResolvedSnippet;
  functionDefinition(options: FunctionDefinitionOptions): string;

  typeInstantiation(schema: BaseData, args: readonly Snippet[]): ResolvedSnippet;
  numericLiteral(value: number, schema: BaseData): ResolvedSnippet;

  emitTypeAnnotation(schema: BaseData): string;
  emitCall(name: string, templateParams: readonly Snippet[], args: readonly Snippet[]): string;
  emitBinaryOp(lhs: Snippet, op: BinaryOperator, rhs: Snippet): string;
}
