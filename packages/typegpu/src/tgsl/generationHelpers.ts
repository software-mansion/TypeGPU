import { UnknownData } from '../data/dataTypes.ts';
import { abstractFloat, abstractInt, bool, f32, i32 } from '../data/numeric.ts';
import { isRef } from '../data/ref.ts';
import {
  isEphemeralSnippet,
  isSnippet,
  type ResolvedSnippet,
  snip,
  type Snippet,
} from '../data/snippet.ts';
import {
  type AnyWgslData,
  type BaseData,
  type F32,
  type I32,
  isMatInstance,
  isNaturallyEphemeral,
  isVecInstance,
  type WgslArray,
  WORKAROUND_getSchema,
} from '../data/wgslTypes.ts';
import {
  type FunctionScopeLayer,
  getOwnSnippet,
  type ResolutionCtx,
  type SelfResolvable,
} from '../types.ts';
import type { ShelllessRepository } from './shellless.ts';
import { stitch } from '../../src/core/resolve/stitch.ts';
import { WgslTypeError } from '../../src/errors.ts';
import { $internal, $resolve } from '../../src/shared/symbols.ts';

export function numericLiteralToSnippet(value: number): Snippet {
  if (value >= 2 ** 63 || value < -(2 ** 63)) {
    return snip(value, abstractFloat, /* origin */ 'constant');
  }
  // WGSL AbstractInt uses 64-bit precision, but JS numbers are only safe up to 2^53 - 1.
  // Warn when values exceed this range to prevent precision loss.
  if (Number.isInteger(value)) {
    if (!Number.isSafeInteger(value)) {
      console.warn(
        `The integer ${value} exceeds the safe integer range and may have lost precision.`,
      );
    }
    return snip(value, abstractInt, /* origin */ 'constant');
  }
  return snip(value, abstractFloat, /* origin */ 'constant');
}

export function concretize<T extends BaseData>(type: T): T | F32 | I32 {
  if (type.type === 'abstractFloat') {
    return f32;
  }

  if (type.type === 'abstractInt') {
    return i32;
  }

  return type;
}

export function concretizeSnippet(snippet: Snippet): Snippet {
  return snip(
    snippet.value,
    concretize(snippet.dataType as AnyWgslData),
    snippet.origin,
  );
}

export function concretizeSnippets(args: Snippet[]): Snippet[] {
  return args.map(concretizeSnippet);
}

export type GenerationCtx = ResolutionCtx & {
  readonly pre: string;
  /**
   * Used by `typedExpression` to signal downstream
   * expression resolution what type is expected of them.
   *
   * It is used exclusively for inferring the types of structs and arrays.
   * It is modified exclusively by `typedExpression` function.
   */
  expectedType: (BaseData | BaseData[]) | undefined;

  readonly topFunctionScope: FunctionScopeLayer | undefined;
  readonly topFunctionReturnType: BaseData | undefined;

  indent(): string;
  dedent(): string;
  pushBlockScope(): void;
  popBlockScope(): void;
  generateLog(op: string, args: Snippet[]): Snippet;
  getById(id: string): Snippet | null;
  defineVariable(id: string, snippet: Snippet): void;
  setBlockExternals(externals: Record<string, Snippet>): void;
  clearBlockExternals(): void;

  /**
   * Types that are used in `return` statements are
   * reported using this function, and used to infer
   * the return type of the owning function.
   */
  reportReturnType(dataType: BaseData): void;

  readonly shelllessRepo: ShelllessRepository;
};

export function coerceToSnippet(value: unknown): Snippet {
  if (isSnippet(value)) {
    // Already a snippet
    return value;
  }

  if (isRef(value)) {
    throw new Error('Cannot use refs (d.ref(...)) from the outer scope.');
  }

  // Maybe the value can tell us what snippet it is
  const ownSnippet = getOwnSnippet(value);
  if (ownSnippet) {
    return ownSnippet;
  }

  if (isVecInstance(value) || isMatInstance(value)) {
    return snip(value, WORKAROUND_getSchema(value), /* origin */ 'constant');
  }

  if (
    typeof value === 'string' || typeof value === 'function' ||
    typeof value === 'object' || typeof value === 'symbol' ||
    typeof value === 'undefined' || value === null
  ) {
    // Nothing representable in WGSL as-is, so unknown
    return snip(value, UnknownData, /* origin */ 'constant');
  }

  if (typeof value === 'number') {
    return numericLiteralToSnippet(value);
  }

  if (typeof value === 'boolean') {
    return snip(value, bool, /* origin */ 'constant');
  }

  return snip(value, UnknownData, /* origin */ 'constant');
}

/**
 * Intermediate representation for WGSL array expressions.
 * Defers resolution. Stores array elements as snippets so the
 * generator can access them when needed.
 */
export class ArrayExpression implements SelfResolvable {
  readonly [$internal] = true;

  constructor(
    public readonly type: WgslArray<AnyWgslData>,
    public readonly elements: Snippet[],
  ) {
  }

  toString(): string {
    return 'ArrayExpression';
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    for (const elem of this.elements) {
      // We check if there are no references among the elements
      if (
        (elem.origin === 'argument' &&
          !isNaturallyEphemeral(elem.dataType)) ||
        !isEphemeralSnippet(elem)
      ) {
        const snippetStr = ctx.resolve(elem.value, elem.dataType).value;
        const snippetType =
          ctx.resolve(concretize(elem.dataType as BaseData)).value;
        throw new WgslTypeError(
          `'${snippetStr}' reference cannot be used in an array constructor.\n-----\nTry '${snippetType}(${snippetStr})' or 'arrayOf(${snippetType}, count)([...])' to copy the value instead.\n-----`,
        );
      }
    }

    const arrayType = `array<${
      ctx.resolve(this.type.elementType).value
    }, ${this.elements.length}>`;

    return snip(
      stitch`${arrayType}(${this.elements})`,
      this.type,
      /* origin */ 'runtime',
    );
  }
}
