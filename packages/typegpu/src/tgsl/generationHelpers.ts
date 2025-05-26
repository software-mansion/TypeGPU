import { arrayOf } from '../data/array.ts';
import {
  type AnyData,
  isDisarray,
  isSnippet,
  isUnstruct,
  snip,
  type Snippet,
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
  vecTypeToPrimitive,
} from '../data/vector.ts';
import {
  type AnyWgslData,
  type AnyWgslStruct,
  type F16,
  type F32,
  type I32,
  isDecorated,
  isMat,
  isMatInstance,
  isVec,
  isVecInstance,
  isWgslArray,
  isWgslStruct,
  type U32,
} from '../data/wgslTypes.ts';
import { invariant } from '../errors.ts';
import { getResolutionCtx } from '../gpuMode.ts';
import { $wgslDataType } from '../shared/symbols.ts';
import { assertExhaustive } from '../shared/utilityTypes.ts';
import { isNumericSchema } from '../std/numeric.ts';
import { hasInternalDataType, type ResolutionCtx } from '../types.ts';

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
  let dataType = targetType;
  if (isDecorated(dataType)) {
    dataType = dataType.inner as AnyData;
  }

  if (isWgslStruct(dataType) || isUnstruct(dataType)) {
    return dataType.propTypes[propName] as AnyData ?? UnknownData;
  }

  if (dataType === bool || isNumericSchema(dataType)) {
    // No props to be accessed here
    return UnknownData;
  }

  const propLength = propName.length;
  if (
    isVec(dataType) &&
    propLength >= 1 &&
    propLength <= 4
  ) {
    const swizzleTypeChar = dataType.type.includes('bool')
      ? 'b'
      : (dataType.type[4] as SwizzleableType);
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

export function numericLiteralToSnippet(value: string): Snippet | undefined {
  // Hex literals
  if (/^0x[0-9a-f]+$/i.test(value)) {
    return snip(value, abstractInt);
  }

  // Binary literals
  if (/^0b[01]+$/i.test(value)) {
    return snip(`${Number.parseInt(value.slice(2), 2)}`, abstractInt);
  }

  // Floating point literals
  if (/^-?(?:\d+\.\d*|\d*\.\d+)$/i.test(value)) {
    return snip(value, abstractFloat);
  }

  // Floating point literals with scientific notation
  if (/^-?\d+(?:\.\d+)?e-?\d+$/i.test(value)) {
    return snip(value, abstractFloat);
  }

  // Integer literals
  if (/^-?\d+$/i.test(value)) {
    return snip(value, abstractInt);
  }

  return undefined;
}

type ConversionAction = 'ref' | 'deref' | 'cast' | 'none';

type ConversionRankInfo =
  | { rank: number; action: 'cast'; targetType: AnyData }
  | { rank: number; action: Exclude<ConversionAction, 'cast'> };

const INFINITE_RANK: ConversionRankInfo = {
  rank: Number.POSITIVE_INFINITY,
  action: 'none',
};

function unwrapDecorated(data: AnyData): AnyData {
  if (data.type === 'decorated') {
    return data.inner as AnyData;
  }
  return data;
}

function getVectorComponent(type: AnyData): AnyData | undefined {
  return isVec(type) ? vecTypeToPrimitive[type.type] : undefined;
}

function getAutoConversionRank(
  src: AnyData,
  dest: AnyData,
): ConversionRankInfo {
  const trueSrc = unwrapDecorated(src);
  const trueDst = unwrapDecorated(dest);

  if (trueSrc.type === trueDst.type) {
    return { rank: 0, action: 'none' };
  }

  if (trueSrc.type === 'abstractFloat') {
    if (trueDst.type === 'f32') return { rank: 1, action: 'none' };
    if (trueDst.type === 'f16') return { rank: 2, action: 'none' };
  }

  if (trueSrc.type === 'abstractInt') {
    if (trueDst.type === 'i32') return { rank: 3, action: 'none' };
    if (trueDst.type === 'u32') return { rank: 4, action: 'none' };
    if (trueDst.type === 'abstractFloat') return { rank: 5, action: 'none' };
    if (trueDst.type === 'f32') return { rank: 6, action: 'none' };
    if (trueDst.type === 'f16') return { rank: 7, action: 'none' };
  }

  if (isVec(trueSrc) && isVec(trueDst)) {
    const compSrc = getVectorComponent(trueSrc);
    const compDest = getVectorComponent(trueDst);
    if (compSrc && compDest) {
      return getAutoConversionRank(compSrc, compDest);
    }
  }

  if (isMat(trueSrc) && isMat(trueDst)) {
    // Matrix conversion rank depends only on component type (always f32 for now)
    return { rank: 0, action: 'none' };
  }

  return INFINITE_RANK;
}

function getImplicitConversionRank(
  src: AnyData,
  dest: AnyData,
): ConversionRankInfo {
  const trueSrc = unwrapDecorated(src);
  const trueDst = unwrapDecorated(dest);

  if (
    trueSrc.type === 'ptr' &&
    getAutoConversionRank(trueSrc.inner as AnyData, trueDst).rank <
      Number.POSITIVE_INFINITY
  ) {
    return { rank: 0, action: 'deref' };
  }

  if (
    trueDst.type === 'ptr' &&
    getAutoConversionRank(trueSrc, trueDst.inner as AnyData).rank <
      Number.POSITIVE_INFINITY
  ) {
    return { rank: 1, action: 'ref' };
  }

  const primitivePreference = {
    f32: 0,
    f16: 1,
    i32: 2,
    u32: 3,
    bool: 4,
  } as const;
  type PrimitiveType = keyof typeof primitivePreference;

  if (
    trueSrc.type in primitivePreference &&
    trueDst.type in primitivePreference
  ) {
    const srcType = trueSrc.type as PrimitiveType;
    const destType = trueDst.type as PrimitiveType;

    if (srcType !== destType) {
      const srcPref = primitivePreference[srcType];
      const destPref = primitivePreference[destType];

      const rank = destPref < srcPref ? 10 : 20;

      return { rank: rank, action: 'cast', targetType: trueDst };
    }
  }

  return INFINITE_RANK;
}

function getConversionRank(
  src: AnyData,
  dest: AnyData,
  allowImplicit: boolean,
): ConversionRankInfo {
  const autoRank = getAutoConversionRank(src, dest);
  if (autoRank.rank < Number.POSITIVE_INFINITY) {
    return autoRank;
  }
  if (allowImplicit) {
    return getImplicitConversionRank(src, dest);
  }
  return INFINITE_RANK;
}

export type ConversionResultAction = {
  sourceIndex: number;
  action: ConversionAction;
  targetType?: U32 | F32 | I32 | F16;
};

export type ConversionResult = {
  targetType: AnyData;
  actions: ConversionResultAction[];
  hasImplicitConversions?: boolean;
};

function findBestType(
  types: AnyData[],
  uniqueTypes: AnyData[],
  allowImplicit: boolean,
): ConversionResult | undefined {
  let bestType: AnyData | undefined;
  let minSum = Number.POSITIVE_INFINITY;
  const conversionDetails = new Map<AnyData, ConversionRankInfo[]>();

  for (const targetType of uniqueTypes) {
    let currentSum = 0;
    const currentDetails: ConversionRankInfo[] = [];
    let possible = true;

    for (const sourceType of types) {
      const conversion = getConversionRank(
        sourceType,
        targetType,
        allowImplicit,
      );
      if (conversion.rank === Number.POSITIVE_INFINITY) {
        possible = false;
        break;
      }
      currentSum += conversion.rank;
      currentDetails.push(conversion);
    }

    if (possible && currentSum < minSum) {
      minSum = currentSum;
      bestType = targetType;
      conversionDetails.set(bestType, currentDetails);
    }
  }

  if (!bestType) {
    return undefined;
  }

  const bestDetails = conversionDetails.get(bestType) as ConversionRankInfo[];
  const actions: ConversionResultAction[] = bestDetails.map(
    (detail, index) => ({
      sourceIndex: index,
      action: detail.action,
      ...(detail.action === 'cast' && {
        targetType: detail.targetType as U32 | F32 | I32 | F16,
      }),
    }),
  );

  const hasCasts = actions.some((action) => action.action === 'cast');

  return { targetType: bestType, actions, hasImplicitConversions: hasCasts };
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

export function getBestConversion(
  types: AnyData[],
  targetTypes?: AnyData[],
): ConversionResult | undefined {
  if (types.length === 0) return undefined;

  const uniqueTypes = [...new Set(types.map(unwrapDecorated))];
  const uniqueTargetTypes = targetTypes
    ? [...new Set(targetTypes.map(unwrapDecorated))]
    : uniqueTypes;

  const explicitResult = findBestType(types, uniqueTargetTypes, false);
  if (explicitResult) {
    return explicitResult;
  }

  const implicitResult = findBestType(types, uniqueTargetTypes, true);
  if (implicitResult) {
    implicitResult.hasImplicitConversions = implicitResult.actions.some(
      (action) => action.action === 'cast',
    );
    return implicitResult;
  }

  return undefined;
}

export function convertType(
  sourceType: AnyData,
  targetType: AnyData,
  allowImplicit = true,
): ConversionResult | undefined {
  const conversion = getConversionRank(sourceType, targetType, allowImplicit);

  if (conversion.rank < Number.POSITIVE_INFINITY) {
    const actionDetail: ConversionResultAction = {
      sourceIndex: 0,
      action: conversion.action,
    };
    if (conversion.action === 'cast') {
      actionDetail.targetType = conversion.targetType as U32 | F32 | I32 | F16;
    }
    return {
      targetType: unwrapDecorated(targetType),
      actions: [actionDetail],
      hasImplicitConversions: conversion.action === 'cast',
    };
  }

  return undefined;
}

export type GenerationCtx = ResolutionCtx & {
  readonly pre: string;
  readonly callStack: unknown[];
  indent(): string;
  dedent(): string;
  pushBlockScope(): void;
  popBlockScope(): void;
  getById(id: string): Snippet | null;
  defineVariable(id: string, dataType: AnyWgslData | UnknownData): Snippet;
};

function applyActionToSnippet(
  ctx: GenerationCtx,
  value: Snippet,
  action: ConversionResultAction,
  targetType: AnyData,
): Snippet {
  if (action.action === 'none') {
    return snip(value.value, targetType);
  }

  const resolvedValue = ctx.resolve(value.value);

  switch (action.action) {
    case 'ref':
      return snip(`&${resolvedValue}`, targetType);
    case 'deref':
      return snip(`*${resolvedValue}`, targetType);
    case 'cast': {
      return snip(`${ctx.resolve(targetType)}(${resolvedValue})`, targetType);
    }
    default: {
      assertExhaustive(action.action, 'applyActionToSnippet');
    }
  }
}

export function convertToCommonType(
  ctx: GenerationCtx,
  values: Snippet[],
  restrictTo?: AnyData[],
): Snippet[] | undefined {
  const types = values.map((value) => value.dataType);

  if (types.some((type) => type === UnknownData)) {
    return undefined;
  }

  const conversion = getBestConversion(types as AnyData[], restrictTo);
  if (!conversion) {
    return undefined;
  }

  if (conversion.hasImplicitConversions) {
    console.warn(
      `Implicit conversions from [\n${
        values
          .map((v) => `  ${v.value}: ${v.dataType.type}`)
          .join(
            ',\n',
          )
      }\n] to ${conversion.targetType.type} are supported, but not recommended.
Consider using explicit conversions instead.`,
    );
  }

  return values.map((value, index) => {
    const action = conversion.actions[index];
    invariant(action, 'Action should not be undefined');
    return applyActionToSnippet(ctx, value, action, conversion.targetType);
  });
}

export function convertStructValues(
  ctx: GenerationCtx,
  structType: AnyWgslStruct,
  values: Record<string, Snippet>,
): Snippet[] {
  const propKeys = Object.keys(structType.propTypes);

  return propKeys.map((key) => {
    const val = values[key];
    if (!val) {
      throw new Error(`Missing property ${key}`);
    }

    const targetType = structType.propTypes[key];
    const converted = convertToCommonType(ctx, [val], [targetType as AnyData]);
    return converted?.[0] ?? val;
  });
}

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

  if (Array.isArray(value)) {
    const coerced = value.map(coerceToSnippet).filter(Boolean);
    const context = getResolutionCtx() as GenerationCtx | undefined;
    if (!context) {
      throw new Error('Tried to coerce array without a context');
    }

    const converted = convertToCommonType(context, coerced as Snippet[]);
    const commonType = getBestConversion(
      coerced.map((v) => v.dataType as AnyData),
    )?.targetType as AnyWgslData | undefined;

    if (!converted || !commonType) {
      return snip(value, UnknownData);
    }

    return snip(
      converted.map((v) => v.value).join(', '),
      arrayOf(concretize(commonType), value.length),
    );
  }

  if (
    typeof value === 'string' || typeof value === 'function' ||
    typeof value === 'object' || typeof value === 'symbol' ||
    typeof value === 'undefined' || value === null
  ) {
    // Nothing representable in WGSL as-is, so unknown
    return snip(value, UnknownData);
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return snip(
      value,
      numericLiteralToSnippet(String(value))?.dataType ?? UnknownData,
    );
  }

  if (typeof value === 'boolean') {
    return snip(value, bool);
  }

  return snip(value, UnknownData);
}
