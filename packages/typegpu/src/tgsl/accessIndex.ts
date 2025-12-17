import { stitch } from '../core/resolve/stitch.ts';
import {
  type AnyData,
  isDisarray,
  MatrixColumnsAccess,
} from '../data/dataTypes.ts';
import { derefSnippet } from '../data/ref.ts';
import {
  isEphemeralSnippet,
  type Origin,
  snip,
  type Snippet,
} from '../data/snippet.ts';
import { vec2f, vec3f, vec4f } from '../data/vector.ts';
import {
  isNaturallyEphemeral,
  isPtr,
  isVec,
  isWgslArray,
} from '../data/wgslTypes.ts';
import { isKnownAtComptime } from '../types.ts';
import { coerceToSnippet } from './generationHelpers.ts';

const indexableTypeToResult = {
  mat2x2f: vec2f,
  mat3x3f: vec3f,
  mat4x4f: vec4f,
} as const;

export function accessIndex(
  target: Snippet,
  index: Snippet,
): Snippet | undefined {
  // array
  if (isWgslArray(target.dataType) || isDisarray(target.dataType)) {
    const elementType = target.dataType.elementType as AnyData;
    const isElementNatEph = isNaturallyEphemeral(elementType);
    const isTargetEphemeral = isEphemeralSnippet(target);
    const isIndexConstant = index.origin === 'constant';

    let origin: Origin;

    if (target.origin === 'constant-tgpu-const-ref') {
      // Constant refs stay const unless the element/index forces runtime materialization
      if (isIndexConstant) {
        origin = isElementNatEph ? 'constant' : 'constant-tgpu-const-ref';
      } else {
        origin = isElementNatEph ? 'runtime' : 'runtime-tgpu-const-ref';
      }
    } else if (target.origin === 'runtime-tgpu-const-ref') {
      // Runtime refs keep their ref semantics unless the element is ephemeral only
      origin = isElementNatEph ? 'runtime' : 'runtime-tgpu-const-ref';
    } else if (!isTargetEphemeral && !isElementNatEph) {
      // Stable containers can forward their origin information
      origin = target.origin;
    } else if (isIndexConstant && target.origin === 'constant') {
      // Plain constants indexed with constants stay constant
      origin = 'constant';
    } else {
      // Everything else must be produced at runtime
      origin = 'runtime';
    }

    return snip(
      isKnownAtComptime(target) && isKnownAtComptime(index)
        // biome-ignore lint/suspicious/noExplicitAny: it's fine, it's there
        ? (target.value as any)[index.value as number]
        : stitch`${target}[${index}]`,
      elementType,
      /* origin */ origin,
    );
  }

  // vector
  if (isVec(target.dataType)) {
    return snip(
      isKnownAtComptime(target) && isKnownAtComptime(index)
        // biome-ignore lint/suspicious/noExplicitAny: it's fine, it's there
        ? (target.value as any)[index.value as any]
        : stitch`${target}[${index}]`,
      target.dataType.primitive,
      /* origin */ target.origin === 'constant' ||
          target.origin === 'constant-tgpu-const-ref'
        ? 'constant'
        : 'runtime',
    );
  }

  if (isPtr(target.dataType)) {
    // Sometimes values that are typed as pointers aren't instances of `d.ref`, so we
    // allow indexing as if it wasn't a pointer.
    return accessIndex(derefSnippet(target), index);
  }

  // matrix.columns
  if (target.value instanceof MatrixColumnsAccess) {
    const propType = indexableTypeToResult[
      target.value.matrix.dataType.type as keyof typeof indexableTypeToResult
    ];

    return snip(
      stitch`${target.value.matrix}[${index}]`,
      propType,
      /* origin */ target.origin,
    );
  }

  // matrix
  if (target.dataType.type in indexableTypeToResult) {
    throw new Error(
      "The only way of accessing matrix elements in TGSL is through the 'columns' property.",
    );
  }

  if (
    (isKnownAtComptime(target) && isKnownAtComptime(index)) ||
    target.dataType.type === 'unknown'
  ) {
    // No idea what the type is, so we act on the snippet's value and try to guess
    return coerceToSnippet(
      // biome-ignore lint/suspicious/noExplicitAny: we're inspecting the value, and it could be any value
      (target.value as any)[index.value as number],
    );
  }

  return undefined;
}
