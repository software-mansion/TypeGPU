import { stitch } from '../core/resolve/stitch.ts';
import { isDisarray, MatrixColumnsAccess } from '../data/dataTypes.ts';
import { derefSnippet } from '../data/ref.ts';
import { type Origin, snip, type Snippet } from '../data/snippet.ts';
import { vec2f, vec3f, vec4f } from '../data/vector.ts';
import { type BaseData, isPtr, isVec, isWgslArray, isWgslStruct } from '../data/wgslTypes.ts';
import { isKnownAtComptime } from '../types.ts';
import { accessProp } from './accessProp.ts';
import { ArrayExpression, coerceToSnippet } from './generationHelpers.ts';

const indexableTypeToResult = {
  mat2x2f: vec2f,
  mat3x3f: vec3f,
  mat4x4f: vec4f,
} as const;

export function accessIndex(target: Snippet, indexArg: Snippet | number): Snippet | undefined {
  const index = typeof indexArg === 'number' ? coerceToSnippet(indexArg) : indexArg;

  // array
  if (isWgslArray(target.dataType) || isDisarray(target.dataType)) {
    const elementType = target.dataType.elementType;

    let origin: Origin;

    if (target.origin === 'constant-immutable-def') {
      // Constant refs stay const unless the element/index forces runtime materialization
      origin =
        index.origin === 'constant' || index.origin === 'constant-immutable-def'
          ? 'constant-immutable-def'
          : 'runtime-immutable-def';
    } else if (target.origin === 'constant') {
      // Ephemeral constants indexed with constants stay constant, otherwise they become runtime-known
      origin =
        index.origin === 'constant' || index.origin === 'constant-immutable-def'
          ? 'constant'
          : 'runtime';
    } else {
      // Fallthrough
      origin = target.origin;
    }

    if (target.value instanceof ArrayExpression && isKnownAtComptime(index)) {
      return target.value.elements[index.value as number];
    }

    return snip(
      isKnownAtComptime(target) && isKnownAtComptime(index)
        ? // oxlint-disable-next-line typescript/no-explicit-any -- it's fine, it's there
          (target.value as any)[index.value as number]
        : stitch`${target}[${index}]`,
      elementType,
      /* origin */ origin,
    );
  }

  // vector
  if (isVec(target.dataType)) {
    return snip(
      isKnownAtComptime(target) && isKnownAtComptime(index)
        ? // oxlint-disable-next-line typescript/no-explicit-any -- it's fine, it's there
          (target.value as any)[index.value as any]
        : stitch`${target}[${index}]`,
      target.dataType.primitive,
      /* origin */ target.origin,
    );
  }

  if (isPtr(target.dataType)) {
    // Sometimes values that are typed as pointers aren't instances of `d.ref`, so we
    // allow indexing as if it wasn't a pointer.
    return accessIndex(derefSnippet(target), index);
  }

  // matrix.columns
  if (target.value instanceof MatrixColumnsAccess) {
    const propType =
      indexableTypeToResult[
        (target.value.matrix.dataType as BaseData).type as keyof typeof indexableTypeToResult
      ];

    return snip(stitch`${target.value.matrix}[${index}]`, propType, /* origin */ target.origin);
  }

  // matrix
  if ((target.dataType as BaseData).type in indexableTypeToResult) {
    throw new Error(
      "The only way of accessing matrix elements in TypeGPU functions is through the 'columns' property.",
    );
  }

  if (isKnownAtComptime(target) && isKnownAtComptime(index)) {
    // No idea what the type is, so we act on the snippet's value and try to guess
    return coerceToSnippet(
      // oxlint-disable-next-line typescript/no-explicit-any -- we're inspecting the value, and it could be any value
      (target.value as any)[index.value as number],
    );
  }

  if (
    isWgslStruct(target.dataType) &&
    isKnownAtComptime(index) &&
    typeof index.value === 'string'
  ) {
    return accessProp(target, index.value);
  }

  return undefined;
}
