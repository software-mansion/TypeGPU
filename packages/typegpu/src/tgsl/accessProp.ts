import { stitch } from '../core/resolve/stitch.ts';
import { AutoStruct } from '../data/autoStruct.ts';
import { EntryInputRouter } from '../core/function/entryInputRouter.ts';
import { isUnstruct, MatrixColumnsAccess, UnknownData } from '../data/dataTypes.ts';
import { bool, f16, f32, i32, u32 } from '../data/numeric.ts';
import { derefSnippet } from '../data/ref.ts';
import { isSnippet, snip, type Snippet } from '../data/snippet.ts';
import {
  vec2b,
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec3b,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec4b,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
} from '../data/vector.ts';
import {
  type BaseData,
  isMat,
  isPtr,
  isVec,
  isWgslArray,
  isWgslStruct,
} from '../data/wgslTypes.ts';
import { isKnownAtComptime } from '../types.ts';
import { coerceToSnippet, numericLiteralToSnippet } from './generationHelpers.ts';
import { InfixDispatch, infixOperators, type InfixOperatorName } from './infixDispatch.ts';
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

type SwizzleableType = 'f' | 'h' | 'i' | 'u' | 'b';
type SwizzleLength = 1 | 2 | 3 | 4;

const swizzleLenToType: Record<SwizzleableType, Record<SwizzleLength, BaseData>> = {
  f: {
    1: f32,
    2: vec2f,
    3: vec3f,
    4: vec4f,
  },
  h: {
    1: f16,
    2: vec2h,
    3: vec3h,
    4: vec4h,
  },
  i: {
    1: i32,
    2: vec2i,
    3: vec3i,
    4: vec4i,
  },
  u: {
    1: u32,
    2: vec2u,
    3: vec3u,
    4: vec4u,
  },
  b: {
    1: bool,
    2: vec2b,
    3: vec3b,
    4: vec4b,
  },
} as const;

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

  const propLength = propName.length;
  if (
    isVec(target.dataType) &&
    propLength >= 1 &&
    propLength <= 4 &&
    /^[xyzw]+$|^[rgba]+$/.test(propName)
  ) {
    const swizzleTypeChar = target.dataType.type.includes('bool')
      ? 'b'
      : (target.dataType.type[4] as SwizzleableType);
    const swizzleType = swizzleLenToType[swizzleTypeChar][propLength as SwizzleLength];
    if (!swizzleType) {
      return undefined;
    }

    return snip(
      isKnownAtComptime(target)
        ? // oxlint-disable-next-line typescript/no-explicit-any -- it's fine, the prop is there
          (target.value as any)[propName]
        : stitch`${target}.${propName}`,
      swizzleType,
      // Swizzling creates new vectors (unless they're on the lhs of an assignment, but that's not yet supported in WGSL)
      /* origin */ propLength === 1
        ? target.origin
        : target.origin === 'constant' || target.origin === 'constant-immutable-def'
          ? 'constant'
          : 'runtime',
      target.possibleSideEffects,
    );
  }

  if (isKnownAtComptime(target) || target.dataType === UnknownData) {
    // oxlint-disable-next-line typescript/no-explicit-any -- we either know exactly what it is, or have no idea at all
    const prop = (target.value as any)[propName];
    if (isNamable(prop) && getName(prop) === undefined) {
      setName(prop, propName);
    }
    return coerceToSnippet(prop);
  }

  return undefined;
}
