import { stitch } from '../core/resolve/stitch.ts';
import type { AnyData } from '../data/dataTypes.ts';
import { undecorate } from '../data/decorateUtils.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import {
  type F16,
  type F32,
  type I32,
  isMat,
  isVec,
  type U32,
  type WgslStruct,
} from '../data/wgslTypes.ts';
import { invariant, WgslTypeError } from '../errors.ts';
import { DEV, TEST } from '../shared/env.ts';
import { assertExhaustive } from '../shared/utilityTypes.ts';
import type { ResolutionCtx } from '../types.ts';

type ConversionAction = 'ref' | 'deref' | 'cast' | 'none';

type ConversionRankInfo =
  | { rank: number; action: 'cast'; targetType: AnyData }
  | { rank: number; action: Exclude<ConversionAction, 'cast'> };

const INFINITE_RANK: ConversionRankInfo = {
  rank: Number.POSITIVE_INFINITY,
  action: 'none',
};

function getAutoConversionRank(
  src: AnyData,
  dest: AnyData,
): ConversionRankInfo {
  const trueSrc = undecorate(src);
  const trueDst = undecorate(dest);

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
    return getAutoConversionRank(trueSrc.primitive, trueDst.primitive);
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
  const trueSrc = undecorate(src);
  const trueDst = undecorate(dest);

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

  if (trueSrc.type === 'abstractFloat') {
    if (trueDst.type === 'u32') {
      return { rank: 2, action: 'cast', targetType: trueDst };
    }
    if (trueDst.type === 'i32') {
      return { rank: 1, action: 'cast', targetType: trueDst };
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

export function getBestConversion(
  types: AnyData[],
  targetTypes?: AnyData[],
): ConversionResult | undefined {
  if (types.length === 0) return undefined;

  const uniqueTypes = [...new Set(types.map(undecorate))];
  const uniqueTargetTypes = targetTypes
    ? [...new Set(targetTypes.map(undecorate))]
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
      targetType: undecorate(targetType),
      actions: [actionDetail],
      hasImplicitConversions: conversion.action === 'cast',
    };
  }

  return undefined;
}

function applyActionToSnippet(
  ctx: ResolutionCtx,
  snippet: Snippet,
  action: ConversionResultAction,
  targetType: AnyData,
): Snippet {
  if (action.action === 'none') {
    return snip(snippet.value, targetType);
  }

  switch (action.action) {
    case 'ref':
      return snip(stitch`&${snippet}`, targetType);
    case 'deref':
      return snip(stitch`*${snippet}`, targetType);
    case 'cast': {
      return snip(stitch`${ctx.resolve(targetType)}(${snippet})`, targetType);
    }
    default: {
      assertExhaustive(action.action, 'applyActionToSnippet');
    }
  }
}

export type ConvertToCommonTypeOptions<T extends Snippet[]> = {
  ctx: ResolutionCtx;
  values: T;
  restrictTo?: AnyData[] | undefined;
  verbose?: boolean | undefined;
};

export function convertToCommonType<T extends Snippet[]>({
  ctx,
  values,
  restrictTo,
  verbose = true,
}: ConvertToCommonTypeOptions<T>): {
  converted: T;
  commonType: AnyData | undefined;
} {
  const types = values.map((value) => value.dataType);

  if (types.some((type) => type.type === 'unknown')) {
    return {
      converted: values,
      commonType: undefined,
    };
  }

  if (DEV && verbose && Array.isArray(restrictTo) && restrictTo.length === 0) {
    console.warn(
      'convertToCommonType was called with an empty restrictTo array, which prevents any conversions from being made. If you intend to allow all conversions, pass undefined instead. If this was intended call the function conditionally since the result will always be undefined.',
    );
  }

  const conversion = getBestConversion(types as AnyData[], restrictTo);
  if (!conversion) {
    return {
      converted: values,
      commonType: undefined,
    };
  }

  if ((TEST || DEV) && verbose && conversion.hasImplicitConversions) {
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

  return {
    converted: values.map((value, index) => {
      const action = conversion.actions[index];
      invariant(action, 'Action should not be undefined');
      return applyActionToSnippet(ctx, value, action, conversion.targetType);
    }) as T,
    commonType: conversion.targetType,
  };
}

export function tryConvertSnippet(
  ctx: ResolutionCtx,
  snippet: Snippet,
  targetDataType: AnyData,
): Snippet {
  if (targetDataType === snippet.dataType) {
    return snippet;
  }

  if (snippet.dataType.type === 'unknown') {
    // This is it, it's now or never. We expect a specific type, and we're going to get it
    return snip(ctx.resolve(snippet.value, targetDataType), targetDataType);
  }

  const { converted, commonType } = convertToCommonType({
    ctx,
    values: [snippet],
    restrictTo: [targetDataType],
  });

  if (!commonType) {
    throw new WgslTypeError(
      `Cannot convert value of type '${snippet.dataType.type}' to type '${targetDataType.type}'`,
    );
  }

  return converted[0] as Snippet;
}

export function convertStructValues(
  ctx: ResolutionCtx,
  structType: WgslStruct,
  values: Record<string, Snippet>,
): Snippet[] {
  const propKeys = Object.keys(structType.propTypes);

  return propKeys.map((key) => {
    const val = values[key];
    if (!val) {
      throw new Error(`Missing property ${key}`);
    }

    const targetType = structType.propTypes[key];
    const { converted } = convertToCommonType({
      ctx,
      values: [val],
      restrictTo: [targetType as AnyData],
    });
    return converted[0] as Snippet;
  });
}
