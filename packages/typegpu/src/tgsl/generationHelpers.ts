import {
  type AnyData,
  isDisarray,
  isUnstruct,
  UnknownData,
} from '../data/dataTypes.ts';
import { mat2x2f, mat3x3f, mat4x4f } from '../data/matrix.ts';
import {
  abstractFloat,
  abstractInt,
  bool,
  f16,
  f32,
  i32,
  u32,
} from '../data/numeric.ts';
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
  type AnyWgslData,
  hasInternalDataType,
  isMatInstance,
  isNumericSchema,
  isVec,
  isVecInstance,
  isWgslArray,
  isWgslStruct,
} from '../data/wgslTypes.ts';
import { MAX_INT32, MIN_INT32 } from '../shared/constants.ts';
import { $wgslDataType } from '../shared/symbols.ts';
import type { ResolutionCtx } from '../types.ts';

type SwizzleableType = 'f' | 'h' | 'i' | 'u' | 'b';
type SwizzleLength = 1 | 2 | 3 | 4;

const swizzleLenToType: Record<
  SwizzleableType,
  Record<SwizzleLength, AnyData>
> = {
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

const kindToSchema = {
  vec2f: vec2f,
  vec2h: vec2h,
  vec2i: vec2i,
  vec2u: vec2u,
  'vec2<bool>': vec2b,
  vec3f: vec3f,
  vec3h: vec3h,
  vec3i: vec3i,
  vec3u: vec3u,
  'vec3<bool>': vec3b,
  vec4f: vec4f,
  vec4h: vec4h,
  vec4i: vec4i,
  vec4u: vec4u,
  'vec4<bool>': vec4b,
  mat2x2f: mat2x2f,
  mat3x3f: mat3x3f,
  mat4x4f: mat4x4f,
} as const;

const indexableTypeToResult = {
  vec2f: f32,
  vec2h: f16,
  vec2i: i32,
  vec2u: u32,
  'vec2<bool>': bool,
  vec3f: f32,
  vec3h: f16,
  vec3i: i32,
  vec3u: u32,
  'vec3<bool>': bool,
  vec4f: f32,
  vec4h: f16,
  vec4i: i32,
  vec4u: u32,
  'vec4<bool>': bool,
  mat2x2f: vec2f,
  mat3x3f: vec3f,
  mat4x4f: vec4f,
} as const;

export function getTypeForPropAccess(
  targetType: AnyData,
  propName: string,
): AnyData | UnknownData {
  if (isWgslStruct(targetType) || isUnstruct(targetType)) {
    return targetType.propTypes[propName] as AnyData ?? UnknownData;
  }

  if (targetType === bool || isNumericSchema(targetType)) {
    // No props to be accessed here
    return UnknownData;
  }

  const propLength = propName.length;
  if (
    isVec(targetType) &&
    propLength >= 1 &&
    propLength <= 4
  ) {
    const swizzleTypeChar = targetType.type.includes('bool')
      ? 'b'
      : (targetType.type[4] as SwizzleableType);
    const swizzleType =
      swizzleLenToType[swizzleTypeChar][propLength as SwizzleLength];
    if (swizzleType) {
      return swizzleType;
    }
  }

  return UnknownData;
}

export function getTypeForIndexAccess(
  dataType: AnyData,
): AnyData | UnknownData {
  // array
  if (isWgslArray(dataType) || isDisarray(dataType)) {
    return dataType.elementType as AnyData;
  }

  // vector or matrix
  if (dataType.type in indexableTypeToResult) {
    return indexableTypeToResult[
      dataType.type as keyof typeof indexableTypeToResult
    ];
  }

  return UnknownData;
}

export function numericLiteralToSnippet(value: number): Snippet {
  if (Number.isInteger(value) && value >= MIN_INT32 && value <= MAX_INT32) {
    return snip(value, abstractInt);
  }
  return snip(value, abstractFloat);
}

export function concretize(type: AnyWgslData): AnyWgslData {
  if (type.type === 'abstractFloat') {
    return f32;
  }

  if (type.type === 'abstractInt') {
    return i32;
  }

  return type;
}

export type GenerationCtx = ResolutionCtx & {
  readonly pre: string;
  /**
   * Used by `generateTypedExpression` to signal downstream
   * expression resolution what type is expected of them.
   *
   * It is used exclusively for inferring the types of structs and arrays.
   * It is modified exclusively by `generateTypedExpression` function.
   */
  expectedType: AnyData | undefined;

  readonly topFunctionReturnType: AnyData;
  indent(): string;
  dedent(): string;
  pushBlockScope(): void;
  popBlockScope(): void;
  getById(id: string): Snippet | null;
  defineVariable(id: string, snippet: Snippet): void;
};

export function coerceToSnippet(value: unknown): Snippet {
  if (isSnippet(value)) {
    // Already a snippet
    return value;
  }

  if (hasInternalDataType(value)) {
    // The value knows better about what type it is
    return snip(value, value[$wgslDataType] as AnyData);
  }

  if (isVecInstance(value) || isMatInstance(value)) {
    return snip(value, kindToSchema[value.kind]);
  }

  if (
    typeof value === 'string' || typeof value === 'function' ||
    typeof value === 'object' || typeof value === 'symbol' ||
    typeof value === 'undefined' || value === null
  ) {
    // Nothing representable in WGSL as-is, so unknown
    return snip(value, UnknownData);
  }

  if (typeof value === 'number') {
    return numericLiteralToSnippet(value);
  }

  if (typeof value === 'boolean') {
    return snip(value, bool);
  }

  return snip(value, UnknownData);
}
