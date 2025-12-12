import { type AnyData, UnknownData } from '../data/dataTypes.ts';
import { abstractFloat, abstractInt, bool, f32, i32 } from '../data/numeric.ts';
import { isRef } from '../data/ref.ts';
import { isSnippet, snip, type Snippet } from '../data/snippet.ts';
import {
  type AnyWgslData,
  type F32,
  type I32,
  isMatInstance,
  isVecInstance,
  WORKAROUND_getSchema,
} from '../data/wgslTypes.ts';
import {
  type FunctionScopeLayer,
  getOwnSnippet,
  type ResolutionCtx,
} from '../types.ts';
import type { ShelllessRepository } from './shellless.ts';

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

export function concretize<T extends AnyData>(type: T): T | F32 | I32 {
  if (type.type === 'abstractFloat') {
    return f32;
  }

  if (type.type === 'abstractInt') {
    return i32;
  }

  return type;
}

export function concretizeSnippets(args: Snippet[]): Snippet[] {
  return args.map((snippet) =>
    snip(
      snippet.value,
      concretize(snippet.dataType as AnyWgslData),
      /* origin */ snippet.origin,
    )
  );
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
  expectedType: AnyData | undefined;

  readonly topFunctionScope: FunctionScopeLayer | undefined;
  readonly topFunctionReturnType: AnyData | undefined;

  indent(): string;
  dedent(): string;
  pushBlockScope(): void;
  popBlockScope(): void;
  generateLog(op: string, args: Snippet[]): Snippet;
  getById(id: string): Snippet | null;
  defineVariable(id: string, snippet: Snippet): void;

  /**
   * Types that are used in `return` statements are
   * reported using this function, and used to infer
   * the return type of the owning function.
   */
  reportReturnType(dataType: AnyData): void;

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
