import { UnknownData } from '../data/dataTypes.ts';
import { isAlias, snip, type Snippet } from '../data/snippet.ts';
import { stitch } from '../core/resolve/stitch.ts';
import * as wgsl from '../data/wgslTypes.ts';
import { i32, u32 } from '../data/numeric.ts';
import { invariant, WgslTypeError } from '../errors.ts';
import { arrayLength } from '../std/array.ts';
import { accessIndex } from './accessIndex.ts';
import { createPtrFromOrigin, implicitFrom } from '../data/ptr.ts';
import { $gpuCallable } from '../shared/symbols.ts';
import { ArrayExpression, concretize, type GenerationCtx } from './generationHelpers.ts';
import { isTgpuRange } from '../std/range.ts';

export function getLoopVarKind(elementSnippet: Snippet) {
  // If it's ephemeral, it's a value that cannot change. If it's a reference, we take
  // an implicit pointer to it
  return elementSnippet.origin === 'constant-immutable-def' ? 'const' : 'let';
}

export function getElementSnippet(iterableSnippet: Snippet, index: Snippet) {
  const elementSnippet = accessIndex(iterableSnippet, index);

  if (!elementSnippet) {
    throw new WgslTypeError('`for ... of ...` loops only support array or vector iterables');
  }

  return elementSnippet;
}

/**
 * Determines the type of the element as accessible inside of the `for .. of` loop body
 */
export function getElementType(elementSnippet: Snippet, iterableSnippet: Snippet) {
  let elementType = elementSnippet.dataType;
  if (elementType === UnknownData) {
    throw new WgslTypeError(
      stitch`The elements in iterable ${iterableSnippet} are of unknown type`,
    );
  }

  if (
    wgsl.isNaturallyEphemeral(elementSnippet.dataType) ||
    elementSnippet.origin === 'runtime' ||
    elementSnippet.origin === 'constant' ||
    elementSnippet.origin === 'constant-immutable-def' ||
    elementSnippet.origin === 'runtime-immutable-def'
  ) {
    return elementType;
  }

  if (!wgsl.isPtr(elementType)) {
    const ptrType = createPtrFromOrigin(
      elementSnippet.origin,
      concretize(elementType as wgsl.AnyWgslData) as wgsl.StorableData,
    );
    invariant(ptrType !== undefined, `Creating pointer type from origin ${elementSnippet.origin}`);
    elementType = ptrType;
  }

  return implicitFrom(elementType as wgsl.Ptr);
}

export function getRangeSnippets(
  ctx: GenerationCtx,
  iterableSnippet: Snippet,
  unroll: boolean = false,
): { start: Snippet; end: Snippet; step: Snippet; comparison: '<' | '>' } {
  const { value, dataType } = iterableSnippet;

  if (isTgpuRange(value)) {
    const { start, end, step } = value;
    const dataType = [start, end, step].every((v) => v >= 0) ? u32 : i32;

    return {
      start: snip(start, dataType, 'constant', false),
      end: snip(end, dataType, 'constant', false),
      step: snip(step, dataType, 'constant', false),
      comparison: step < 0 ? '>' : '<',
    };
  }

  if (!unroll && !isAlias(iterableSnippet)) {
    throw new Error(
      `\`for ... of ...\` loops only support std.range or iterables stored in variables.
-----
You can wrap iterable with \`tgpu.unroll(...)\`. If iterable is known at comptime, the loop will be unrolled.
-----`,
    );
  }

  const defaults = {
    start: snip(0, u32, 'constant', false),
    step: snip(1, u32, 'constant', false),
    comparison: '<' as const,
  };

  if (wgsl.isWgslArray(dataType)) {
    return {
      ...defaults,
      end:
        dataType.elementCount > 0
          ? snip(dataType.elementCount, u32, 'constant', false)
          : arrayLength[$gpuCallable].call(ctx, [iterableSnippet]),
    };
  }

  if (wgsl.isVec(dataType)) {
    return {
      ...defaults,
      end: snip(dataType.componentCount, u32, 'constant', false),
    };
  }

  if (unroll) {
    if (Array.isArray(value)) {
      return {
        ...defaults,
        end: snip(value.length, u32, 'constant', false),
      };
    }

    if (value instanceof ArrayExpression) {
      return {
        ...defaults,
        end: snip(value.elements.length, u32, 'constant', false),
      };
    }
  }

  throw new WgslTypeError('`for ... of ...` loops only support array or vector iterables');
}
