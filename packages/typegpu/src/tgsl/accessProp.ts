import { stitch } from '../core/resolve/stitch.ts';
import { AutoStruct } from '../data/autoStruct.ts';
import { EntryInputRouter } from '../core/function/entryInputRouter.ts';
import { isUnstruct, UnknownData } from '../data/dataTypes.ts';
import { MatrixColumnsAccess } from '../data/matrixColumnsAccess.ts';
import { u32 } from '../data/numeric.ts';
import { derefSnippet } from '../data/ref.ts';
import { isSnippet, snip, type Snippet } from '../data/snippet.ts';
import {
  type BaseData,
  isMat,
  isPtr,
  isVec,
  isWgslArray,
  isWgslStruct,
} from '../data/wgslTypes.ts';
import { asComptime } from '../types.ts';
import { coerceToSnippet, numericLiteralToSnippet } from './generationHelpers.ts';
import { isValidSwizzle, Swizzle } from './swizzle.ts';
import { InfixDispatch, type InfixOperatorName, infixOperators } from './infixDispatch.ts';
import { accessStructProp } from './accessStructProp.ts';
import { getName, isNamable, setName } from '../shared/meta.ts';

const infixKinds = [
  'vec2f',
  'vec3f',
  'vec4f',
  'vec2h',
  'vec3h',
  'vec4h',
  'vec2i',
  'vec3i',
  'vec4i',
  'vec2u',
  'vec3u',
  'vec4u',
  'mat2x2f',
  'mat3x3f',
  'mat4x4f',
];

export function accessProp(target: Snippet, propName: string): Snippet | undefined {
  if (infixKinds.includes((target.dataType as BaseData).type) && propName in infixOperators) {
    const operator = infixOperators[propName as InfixOperatorName];
    return snip(
      new InfixDispatch(target, operator),
      UnknownData,
      /* origin */ target.origin,
      target.possibleSideEffects,
    );
  }

  if (isWgslArray(target.dataType) && propName === 'length') {
    if (target.dataType.elementCount === 0) {
      // Dynamically-sized array
      return snip(
        stitch`arrayLength(&${target})`,
        u32,
        /* origin */ 'runtime',
        target.possibleSideEffects,
      );
    }

    return numericLiteralToSnippet(target.dataType.elementCount);
  }

  if (isMat(target.dataType) && propName === 'columns') {
    return snip(
      new MatrixColumnsAccess(target),
      UnknownData,
      /* origin */ target.origin,
      target.possibleSideEffects,
    );
  }

  if (isWgslStruct(target.dataType) || isUnstruct(target.dataType)) {
    return accessStructProp(target, propName);
  }

  if (target.dataType instanceof AutoStruct) {
    const result = target.dataType.accessProp(propName);
    if (!result) {
      return undefined;
    }
    return snip(
      stitch`${target}.${result.prop}`,
      result.type,
      'argument',
      target.possibleSideEffects,
    );
  }

  if (target.dataType instanceof EntryInputRouter) {
    const result = target.dataType.accessProp(propName);
    if (isSnippet(result)) {
      return result;
    }
    if (result) {
      return accessProp(result.target, result.prop);
    }
    return undefined;
  }

  if (isPtr(target.dataType)) {
    const derefed = derefSnippet(target);

    if (propName === '$') {
      // Dereference pointer
      return derefed;
    }

    // Sometimes values that are typed as pointers aren't instances of `d.ref`, so we
    // allow access to member props as if it wasn't a pointer.
    return accessProp(derefed, propName);
  }

  if (isVec(target.dataType)) {
    // Example: d.vec3f().kind === 'vec3f'
    if (propName === 'kind') {
      // The snippet has no side-effects
      return snip(target.dataType.type, UnknownData, 'constant', /* possibleSideEffects */ false);
    }
  }

  if (isVec(target.dataType) && isValidSwizzle(propName)) {
    const swizzle = new Swizzle(target, propName);
    return snip(swizzle, swizzle.dataType, swizzle.origin, target.possibleSideEffects);
  }

  const knownTarget = asComptime(target);
  if (knownTarget) {
    // oxlint-disable-next-line typescript/no-explicit-any
    const prop = (knownTarget.value as any)[propName];
    if (isNamable(prop) && getName(prop) === undefined) {
      setName(prop, propName);
    }
    return coerceToSnippet(prop);
  }

  return undefined;
}
