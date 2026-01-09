import { $internal, $resolve } from '../../src/shared/symbols.ts';
import { type AnyData, UnknownData } from '../data/dataTypes.ts';
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
  type SelfResolvable,
} from '../types.ts';
import type { ShelllessRepository } from './shellless.ts';
import { stitch } from '../../src/core/resolve/stitch.ts';
import * as wgsl from '../data/wgslTypes.ts';
import { u32 } from '../data/numeric.ts';
import { invariant, WgslTypeError } from '../../src/errors.ts';
import { arrayLength } from '../std/array.ts';
import { accessIndex } from './accessIndex.ts';
import { createPtrFromOrigin, implicitFrom } from '../../src/data/ptr.ts';

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

// defers the resolution of array expressions
export class ArrayExpression implements SelfResolvable {
  readonly [$internal] = true;

  constructor(
    public readonly elementType: AnyWgslData,
    public readonly type: AnyWgslData,
    public readonly elements: Snippet[],
  ) {
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const arrayType = `array<${
      ctx.resolve(this.elementType).value
    }, ${this.elements.length}>`;

    return snip(
      stitch`${arrayType}(${this.elements})`,
      this.type,
      /* origin */ 'runtime',
    );
  }
}

export const forOfHelpers = {
  getLoopVarKind(elementSnippet: Snippet) {
    // If it's ephemeral, it's a value that cannot change. If it's a reference, we take
    // an implicit pointer to it
    return elementSnippet.origin === 'constant-tgpu-const-ref'
      ? 'const'
      : 'let';
  },
  getValidIndexName(ctx: GenerationCtx) {
    // Our index name will be some element from infinite sequence (i, ii, iii, ...).
    // If user defines `i` and `ii` before `for ... of ...` loop, then our index name will be `iii`.
    // If user defines `i` inside `for ... of ...` then it will be scoped to a new block,
    // so we can safely use `i`.
    let index = 'i'; // it will be valid name, no need to call this.ctx.makeNameValid
    while (ctx.getById(index) !== null) {
      index += 'i';
    }

    return index;
  },
  getElementSnippet(iterableSnippet: Snippet, index: string) {
    const elementSnippet = accessIndex(
      iterableSnippet,
      snip(index, u32, 'runtime'),
    );

    if (!elementSnippet) {
      throw new WgslTypeError(
        '`for ... of ...` loops only support array or vector iterables',
      );
    }

    return elementSnippet;
  },
  getElementType(elementSnippet: Snippet) {
    let elementType = elementSnippet.dataType;

    if (
      isEphemeralSnippet(elementSnippet) ||
      elementSnippet.origin === 'constant-tgpu-const-ref' ||
      elementSnippet.origin === 'runtime-tgpu-const-ref'
    ) {
      return elementType;
    }

    if (!wgsl.isPtr(elementType)) {
      const ptrType = createPtrFromOrigin(
        elementSnippet.origin,
        concretize(elementType as wgsl.AnyWgslData) as wgsl.StorableData,
      );
      invariant(
        ptrType !== undefined,
        `Creating pointer type from origin ${elementSnippet.origin}`,
      );
      elementType = ptrType;
    }

    return implicitFrom(elementType);
  },
  getElementCountSnippet(iterableSnippet: Snippet) {
    const iterableDataType = iterableSnippet.dataType;

    if (wgsl.isWgslArray(iterableDataType)) {
      return iterableDataType.elementCount > 0
        ? snip(
          `${iterableDataType.elementCount}`,
          u32,
          'constant',
        )
        : arrayLength[$internal].gpuImpl(iterableSnippet);
    }

    if (wgsl.isVec(iterableDataType)) {
      return snip(
        `${Number(iterableDataType.type.match(/\d/))}`,
        u32,
        'constant',
      );
    }

    throw new WgslTypeError(
      '`for ... of ...` loops only support array or vector iterables',
    );
  },
} as const;
