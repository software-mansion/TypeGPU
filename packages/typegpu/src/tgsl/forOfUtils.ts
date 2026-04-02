import { UnknownData } from '../data/dataTypes.ts';
import { isEphemeralSnippet, snip, type Snippet } from '../data/snippet.ts';
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
  return elementSnippet.origin === 'constant-tgpu-const-ref' ? 'const' : 'let';
}

export function getElementSnippet(iterableSnippet: Snippet, index: Snippet) {
  const elementSnippet = accessIndex(iterableSnippet, index);

  if (!elementSnippet) {
    throw new WgslTypeError('`for ... of ...` loops only support array or vector iterables');
  }

  return elementSnippet;
}

export function getElementType(elementSnippet: Snippet, iterableSnippet: Snippet) {
  let elementType = elementSnippet.dataType;
  if (elementType === UnknownData) {
    throw new WgslTypeError(
      stitch`The elements in iterable ${iterableSnippet} are of unknown type`,
    );
  }

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
    return {
      start: snip(value.start, i32, 'constant'),
      end: snip(value.end, i32, 'constant'),
      step: snip(value.step, i32, 'constant'),
      comparison: value.step < 0 ? '>' : '<',
    };
  }

  if (!unroll && isEphemeralSnippet(iterableSnippet)) {
    throw new Error(
      `\`for ... of ...\` loops only support std.range or iterables stored in variables.
-----
You can wrap iterable with \`tgpu.unroll(...)\`. If iterable is known at comptime, the loop will be unrolled.
-----`,
    );
  }

  const defaults = {
    start: snip(0, u32, 'constant'),
    step: snip(1, u32, 'constant'),
    comparison: '<' as const,
  };

  if (wgsl.isWgslArray(dataType)) {
    return {
      ...defaults,
      end:
        dataType.elementCount > 0
          ? snip(dataType.elementCount, u32, 'constant')
          : arrayLength[$gpuCallable].call(ctx, [iterableSnippet]),
    };
  }

  if (wgsl.isVec(dataType)) {
    return {
      ...defaults,
      end: snip(dataType.componentCount, u32, 'constant'),
    };
  }

  if (unroll) {
    if (Array.isArray(value)) {
      return {
        ...defaults,
        end: snip(value.length, u32, 'constant'),
      };
    }

    if (value instanceof ArrayExpression) {
      return {
        ...defaults,
        end: snip(value.elements.length, u32, 'constant'),
      };
    }
  }

  throw new WgslTypeError('`for ... of ...` loops only support array or vector iterables');
}
