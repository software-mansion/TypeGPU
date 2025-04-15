import { isDerived, isSlot } from '../core/slot/slotTypes.ts';
import type { AnyData } from '../data/dataTypes.ts';
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
} from '../data/vector.ts';
import {
  type F16,
  type F32,
  type I32,
  type U32,
  type WgslStruct,
  isDecorated,
  isMat,
  isVec,
  isWgslArray,
  isWgslData,
} from '../data/wgslTypes.ts';
import { getResolutionCtx } from '../gpuMode.ts';
import { $internal } from '../shared/symbols.ts';
import {
  type Snippet,
  UnknownData,
  type Wgsl,
  hasInternalDataType,
} from '../types.ts';

const swizzleableTypes = [
  'vec2f',
  'vec2h',
  'vec2i',
  'vec2u',
  'vec2<bool>',
  'vec3f',
  'vec3h',
  'vec3i',
  'vec3u',
  'vec3<bool>',
  'vec4f',
  'vec4h',
  'vec4i',
  'vec4u',
  'vec4<bool>',
  'struct',
] as const;

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
  targetType: Wgsl,
  propName: string,
): AnyData | UnknownData {
  if (
    typeof targetType === 'string' ||
    typeof targetType === 'number' ||
    typeof targetType === 'boolean'
  ) {
    return UnknownData;
  }

  if (isDerived(targetType) || isSlot(targetType)) {
    const ctx = getResolutionCtx();
    if (!ctx) {
      throw new Error(
        'Resolution context not found when unwrapping slot or derived',
      );
    }
    const unwrapped = ctx.unwrap(targetType);

    return getTypeFromWgsl(unwrapped);
  }

  let target = targetType as AnyData;

  if (hasInternalDataType(target)) {
    target = target[$internal].dataType as AnyData;
  }
  while (isDecorated(target)) {
    target = target.inner as AnyData;
  }

  const targetTypeStr =
    'kind' in target ? (target.kind as string) : target.type;

  if (targetTypeStr === 'struct') {
    return (
      ((target as WgslStruct).propTypes[propName] as AnyData) ?? UnknownData
    );
  }

  const propLength = propName.length;
  if (
    swizzleableTypes.includes(
      targetTypeStr as (typeof swizzleableTypes)[number],
    ) &&
    propLength >= 1 &&
    propLength <= 4
  ) {
    const swizzleTypeChar = targetTypeStr.includes('bool')
      ? 'b'
      : (targetTypeStr[4] as SwizzleableType);
    const swizzleType =
      swizzleLenToType[swizzleTypeChar][propLength as SwizzleLength];
    if (swizzleType) {
      return swizzleType;
    }
  }

  return isWgslData(target) ? target : UnknownData;
}

export function getTypeForIndexAccess(resource: Wgsl): AnyData | UnknownData {
  if (isWgslData(resource)) {
    // array
    if (isWgslArray(resource)) {
      return resource.elementType as AnyData;
    }

    // vector or matrix
    if (resource.type in indexableTypeToResult) {
      return indexableTypeToResult[
        resource.type as keyof typeof indexableTypeToResult
      ];
    }
  }

  return UnknownData;
}

export function getTypeFromWgsl(resource: Wgsl): AnyData | UnknownData {
  if (isDerived(resource) || isSlot(resource)) {
    return getTypeFromWgsl(resource.value as Wgsl);
  }

  if (typeof resource === 'string') {
    return UnknownData;
  }
  if (typeof resource === 'number') {
    return numericLiteralToSnippet(String(resource))?.dataType ?? UnknownData;
  }
  if (typeof resource === 'boolean') {
    return bool;
  }

  if ('kind' in resource) {
    const kind = resource.kind;
    if (kind in kindToSchema) {
      return kindToSchema[kind];
    }
  }

  return isWgslData(resource) ? resource : UnknownData;
}

export function numericLiteralToSnippet(value: string): Snippet | undefined {
  // Hex literals
  if (/^0x[0-9a-f]+$/i.test(value)) {
    return { value, dataType: abstractInt };
  }

  // Binary literals
  if (/^0b[01]+$/i.test(value)) {
    return {
      value: `${Number.parseInt(value.slice(2), 2)}`,
      dataType: abstractInt,
    };
  }

  // Floating point literals
  if (/^-?(?:\d+\.\d*|\d*\.\d+)$/i.test(value)) {
    return { value, dataType: abstractFloat };
  }

  // Floating point literals with scientific notation
  if (/^-?\d+(?:\.\d+)?e-?\d+$/i.test(value)) {
    return { value, dataType: abstractFloat };
  }

  // Integer literals
  if (/^-?\d+$/i.test(value)) {
    return { value, dataType: abstractInt };
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

function unwrapDecorated(type: AnyData): AnyData {
  let currentType = type;
  while (currentType.type === 'decorated') {
    currentType = currentType.inner as AnyData;
  }
  return currentType;
}

const vecComponentMap: Readonly<Record<string, AnyData>> = {
  [vec2f.type]: f32,
  [vec3f.type]: f32,
  [vec4f.type]: f32,
  [vec2h.type]: f16,
  [vec3h.type]: f16,
  [vec4h.type]: f16,
  [vec2i.type]: i32,
  [vec3i.type]: i32,
  [vec4i.type]: i32,
  [vec2u.type]: u32,
  [vec3u.type]: u32,
  [vec4u.type]: u32,
};

function getVectorComponent(type: AnyData): AnyData | undefined {
  return vecComponentMap[type.type];
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
    return { rank: 0, action: 'ref' };
  }

  const primitiveTypes = ['f32', 'f16', 'i32', 'u32', 'bool'];
  if (
    primitiveTypes.includes(trueSrc.type) &&
    primitiveTypes.includes(trueDst.type) &&
    trueSrc.type !== trueDst.type
  ) {
    // the rank 10 is kind of arbitrary, but it should be higher than the rank of deref/ref
    return { rank: 10, action: 'cast', targetType: trueDst };
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

  return { targetType: bestType, actions };
}

export function getBestConversion(
  types: AnyData[],
): ConversionResult | undefined {
  if (types.length === 0) return undefined;

  const uniqueTypes = [...new Set(types.map(unwrapDecorated))];

  const explicitResult = findBestType(types, uniqueTypes, false);
  if (explicitResult) return explicitResult;

  const implicitResult = findBestType(types, uniqueTypes, true);
  if (implicitResult) {
    implicitResult.hasImplicitConversions = true;
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
      hasImplicitConversions:
        conversion.action !== 'none' && conversion.rank > 0,
    };
  }

  return undefined;
}
