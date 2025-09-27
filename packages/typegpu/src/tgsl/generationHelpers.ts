import {
  type AnyData,
  isDisarray,
  isUnstruct,
  undecorate,
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
import {
  isSnippet,
  type ResolvedSnippet,
  snip,
  type Snippet,
} from '../data/snippet.ts';
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
  type F32,
  type I32,
  isMatInstance,
  isNaturallyRef,
  isNumericSchema,
  isVec,
  isVecInstance,
  isWgslArray,
  isWgslStruct,
} from '../data/wgslTypes.ts';
import { getResolutionCtx } from '../execMode.ts';
import { getOwnSnippet, type ResolutionCtx } from '../types.ts';
import type { ShelllessRepository } from './shellless.ts';

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

export function getTypeForPropAccess(
  targetType: AnyData,
  propName: string,
): AnyData | UnknownData {
  if (isWgslStruct(targetType) || isUnstruct(targetType)) {
    const propType = targetType.propTypes[propName];
    return propType ? undecorate(propType) as AnyData : UnknownData;
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

export function accessProp(
  target: Snippet,
  propName: string,
): ResolvedSnippet | undefined {
  // biome-ignore lint/style/noNonNullAssertion: it's there
  const ctx = getResolutionCtx()!;

  if (isWgslStruct(target.dataType) || isUnstruct(target.dataType)) {
    let propType = target.dataType.propTypes[propName];
    if (!propType) {
      return undefined;
    }
    propType = undecorate(propType);

    return snip(
      `${ctx.resolve(target.value, target.dataType).value}.${propName}`,
      propType,
      /* ref */ target.ref !== undefined && isNaturallyRef(propType)
        ? target.ref
        : undefined,
    );
  }

  if (target.dataType.type === 'bool' || isNumericSchema(target.dataType)) {
    // No props to be accessed here
    return undefined;
  }

  const propLength = propName.length;
  if (
    isVec(target.dataType) &&
    propLength >= 1 &&
    propLength <= 4
  ) {
    const swizzleTypeChar = target.dataType.type.includes('bool')
      ? 'b'
      : (target.dataType.type[4] as SwizzleableType);
    const swizzleType =
      swizzleLenToType[swizzleTypeChar][propLength as SwizzleLength];
    if (!swizzleType) {
      return undefined;
    }
    return snip(
      `${ctx.resolve(target.value, target.dataType).value}.${propName}`,
      swizzleType,
      // Swizzling creates new vectors (unless they're on the lhs of an assignment, but that's not yet supported in WGSL)
      /* ref */ undefined,
    );
  }

  return undefined;
}

const indexableTypeToResult = {
  mat2x2f: vec2f,
  mat3x3f: vec3f,
  mat4x4f: vec4f,
} as const;

export function getTypeForIndexAccess(
  dataType: AnyData,
): AnyData | UnknownData {
  // array
  if (isWgslArray(dataType) || isDisarray(dataType)) {
    return dataType.elementType as AnyData;
  }

  // vector
  if (isVec(dataType)) {
    return dataType.primitive;
  }

  // matrix
  if (dataType.type in indexableTypeToResult) {
    return indexableTypeToResult[
      dataType.type as keyof typeof indexableTypeToResult
    ];
  }

  return UnknownData;
}

export function numericLiteralToSnippet(value: number): Snippet {
  // WGSL AbstractInt uses 64-bit precision, but JS numbers are only safe up to 2^53 - 1.
  // Warn when values exceed this range to prevent precision loss.
  if (Number.isInteger(value)) {
    if (!Number.isSafeInteger(value)) {
      console.warn(
        `The integer ${value} exceeds the safe integer range and may have lost precision.`,
      );
    }
    return snip(value, abstractInt, /* ref */ undefined);
  }
  return snip(value, abstractFloat, /* ref */ undefined);
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
      /* ref */ snippet.ref,
    )
  );
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

  readonly topFunctionReturnType: AnyData | undefined;

  indent(): string;
  dedent(): string;
  pushBlockScope(): void;
  popBlockScope(): void;
  generateLog(args: Snippet[]): Snippet;
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

  // Maybe the value can tell us what snippet it is
  const ownSnippet = getOwnSnippet(value);
  if (ownSnippet) {
    return ownSnippet;
  }

  if (isVecInstance(value) || isMatInstance(value)) {
    return snip(value, kindToSchema[value.kind], /* ref */ undefined);
  }

  if (
    typeof value === 'string' || typeof value === 'function' ||
    typeof value === 'object' || typeof value === 'symbol' ||
    typeof value === 'undefined' || value === null
  ) {
    // Nothing representable in WGSL as-is, so unknown
    return snip(value, UnknownData, /* ref */ undefined);
  }

  if (typeof value === 'number') {
    return numericLiteralToSnippet(value);
  }

  if (typeof value === 'boolean') {
    // It's a primitive, so `ref` is false
    return snip(value, bool, /* ref */ undefined);
  }

  return snip(value, UnknownData, /* ref */ undefined);
}
