import {
  type AnyData,
  InfixDispatch,
  isDisarray,
  isUnstruct,
  MatrixColumnsAccess,
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
import { isRef, isSnippet, snip, type Snippet } from '../data/snippet.ts';
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
  isMat,
  isMatInstance,
  isNaturallyRef,
  isVec,
  isVecInstance,
  isWgslArray,
  isWgslStruct,
} from '../data/wgslTypes.ts';
import {
  getOwnSnippet,
  isKnownAtComptime,
  type ResolutionCtx,
} from '../types.ts';
import type { ShelllessRepository } from './shellless.ts';
import { add, div, mul, sub } from '../std/operators.ts';
import { $internal } from '../shared/symbols.ts';
import { stitch } from '../core/resolve/stitch.ts';

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

export const infixOperators = {
  add,
  sub,
  mul,
  div,
} as const;

export type InfixOperator = keyof typeof infixOperators;

export function accessProp(
  target: Snippet,
  propName: string,
): Snippet | undefined {
  if (
    infixKinds.includes(target.dataType.type) &&
    propName in infixOperators
  ) {
    return snip(
      new InfixDispatch(
        propName,
        target,
        infixOperators[propName as InfixOperator][$internal].gpuImpl,
      ),
      UnknownData,
      /* ref */ target.ref,
    );
  }

  if (isWgslArray(target.dataType) && propName === 'length') {
    if (target.dataType.elementCount === 0) {
      // Dynamically-sized array
      return snip(
        stitch`arrayLength(&${target})`,
        u32,
        /* ref */ 'runtime',
      );
    }

    return snip(
      target.dataType.elementCount,
      abstractInt,
      /* ref */ 'constant',
    );
  }

  if (isMat(target.dataType) && propName === 'columns') {
    return snip(
      new MatrixColumnsAccess(target),
      UnknownData,
      /* ref */ target.ref,
    );
  }

  if (isWgslStruct(target.dataType) || isUnstruct(target.dataType)) {
    let propType = target.dataType.propTypes[propName];
    if (!propType) {
      return undefined;
    }
    propType = undecorate(propType);

    return snip(
      stitch`${target}.${propName}`,
      propType,
      /* ref */ isRef(target) && isNaturallyRef(propType)
        ? target.ref
        : target.ref === 'constant' || target.ref === 'constant-ref'
        ? 'constant'
        : 'runtime',
    );
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
      isKnownAtComptime(target)
        // biome-ignore lint/suspicious/noExplicitAny: it's fine, the prop is there
        ? (target.value as any)[propName]
        : stitch`${target}.${propName}`,
      swizzleType,
      // Swizzling creates new vectors (unless they're on the lhs of an assignment, but that's not yet supported in WGSL)
      /* ref */ target.ref === 'constant' || target.ref === 'constant-ref'
        ? 'constant'
        : 'runtime',
    );
  }

  if (isKnownAtComptime(target) || target.dataType.type === 'unknown') {
    // biome-ignore lint/suspicious/noExplicitAny: we either know exactly what it is, or have no idea at all
    return coerceToSnippet((target.value as any)[propName]);
  }

  return undefined;
}

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

    return snip(
      isKnownAtComptime(target) && isKnownAtComptime(index)
        // biome-ignore lint/suspicious/noExplicitAny: it's fine, it's there
        ? (target.value as any)[index.value as number]
        : stitch`${target}[${index}]`,
      elementType,
      /* ref */ isRef(target) && isNaturallyRef(elementType)
        ? target.ref
        : target.ref === 'constant'
        ? 'constant'
        : 'runtime',
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
      /* ref */ target.ref === 'constant' ? 'constant' : 'runtime',
    );
  }

  // matrix.columns
  if (target.value instanceof MatrixColumnsAccess) {
    const propType = indexableTypeToResult[
      target.value.matrix.dataType.type as keyof typeof indexableTypeToResult
    ];

    return snip(
      stitch`${target.value.matrix}[${index}]`,
      propType,
      /* ref */ target.ref,
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

export function numericLiteralToSnippet(value: number): Snippet {
  // WGSL AbstractInt uses 64-bit precision, but JS numbers are only safe up to 2^53 - 1.
  // Warn when values exceed this range to prevent precision loss.
  if (Number.isInteger(value)) {
    if (!Number.isSafeInteger(value)) {
      console.warn(
        `The integer ${value} exceeds the safe integer range and may have lost precision.`,
      );
    }
    return snip(value, abstractInt, /* ref */ 'constant');
  }
  return snip(value, abstractFloat, /* ref */ 'constant');
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
    return snip(value, kindToSchema[value.kind], /* ref */ 'constant');
  }

  if (
    typeof value === 'string' || typeof value === 'function' ||
    typeof value === 'object' || typeof value === 'symbol' ||
    typeof value === 'undefined' || value === null
  ) {
    // Nothing representable in WGSL as-is, so unknown
    return snip(value, UnknownData, /* ref */ 'constant');
  }

  if (typeof value === 'number') {
    return numericLiteralToSnippet(value);
  }

  if (typeof value === 'boolean') {
    return snip(value, bool, /* ref */ 'constant');
  }

  return snip(value, UnknownData, /* ref */ 'constant');
}
