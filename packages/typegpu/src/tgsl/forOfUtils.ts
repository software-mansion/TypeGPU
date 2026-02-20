import { UnknownData } from '../data/dataTypes.ts';
import { isEphemeralSnippet, snip, type Snippet } from '../data/snippet.ts';
import { stitch } from '../core/resolve/stitch.ts';
import * as wgsl from '../data/wgslTypes.ts';
import { u32 } from '../data/numeric.ts';
import { invariant, WgslTypeError } from '../errors.ts';
import { arrayLength } from '../std/array.ts';
import { accessIndex } from './accessIndex.ts';
import { createPtrFromOrigin, implicitFrom } from '../data/ptr.ts';
import { $gpuCallable } from '../shared/symbols.ts';
import { concretize, type GenerationCtx } from './generationHelpers.ts';

export function getLoopVarKind(elementSnippet: Snippet) {
  // If it's ephemeral, it's a value that cannot change. If it's a reference, we take
  // an implicit pointer to it
  return elementSnippet.origin === 'constant-tgpu-const-ref' ? 'const' : 'let';
}

export function getElementSnippet(iterableSnippet: Snippet, index: string) {
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
}

export function getElementType(
  elementSnippet: Snippet,
  iterableSnippet: Snippet,
) {
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
    invariant(
      ptrType !== undefined,
      `Creating pointer type from origin ${elementSnippet.origin}`,
    );
    elementType = ptrType;
  }

  return implicitFrom(elementType as wgsl.Ptr);
}

export function getElementCountSnippet(
  ctx: GenerationCtx,
  iterableSnippet: Snippet,
) {
  const iterableDataType = iterableSnippet.dataType;

  if (wgsl.isWgslArray(iterableDataType)) {
    return iterableDataType.elementCount > 0
      ? snip(
        `${iterableDataType.elementCount}`,
        u32,
        'constant',
      )
      : arrayLength[$gpuCallable].call(ctx, [iterableSnippet]);
  }

  if (wgsl.isVec(iterableDataType)) {
    return snip(
      `${iterableDataType.componentCount}`,
      u32,
      'constant',
    );
  }

  throw new WgslTypeError(
    '`for ... of ...` loops only support array or vector iterables',
  );
}
