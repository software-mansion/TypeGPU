import { stitch } from '../core/resolve/stitch.ts';
import type { AnyData, UnknownData } from '../data/dataTypes.ts';
import { undecorate } from '../data/dataTypes.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import {
  type AnyWgslData,
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
  let bestResult:
    | { type: AnyData; details: ConversionRankInfo[]; sum: number }
    | undefined;

  for (const targetType of uniqueTypes) {
    const details: ConversionRankInfo[] = [];
    let sum = 0;
    for (const sourceType of types) {
      const conversion = getConversionRank(
        sourceType,
        targetType,
        allowImplicit,
      );
      sum += conversion.rank;
      if (conversion.rank === Number.POSITIVE_INFINITY) {
        break;
      }
      details.push(conversion);
    }
    if (sum < (bestResult?.sum ?? Number.POSITIVE_INFINITY)) {
      bestResult = { type: targetType, details, sum };
    }
  }
  if (!bestResult) {
    return undefined;
  }
  const actions: ConversionResultAction[] = bestResult.details.map((
    detail,
    index,
  ) => ({
    sourceIndex: index,
    action: detail.action,
    ...(detail.action === 'cast' && {
      targetType: detail.targetType as U32 | F32 | I32 | F16,
    }),
  }));

  return {
    targetType: bestResult.type,
    actions,
    hasImplicitConversions: actions.some((action) => action.action === 'cast'),
  };
}

export function getBestConversion(
  types: AnyData[],
  targetTypes?: AnyData[],
): ConversionResult | undefined {
  if (types.length === 0) return undefined;

  const uniqueTargetTypes = [
    ...new Set((targetTypes || types).map(undecorate)),
  ];

  const explicitResult = findBestType(types, uniqueTargetTypes, false);
  if (explicitResult) {
    return explicitResult;
  }

  const implicitResult = findBestType(types, uniqueTargetTypes, true);
  if (implicitResult) {
    return implicitResult;
  }

  return undefined;
}

function applyActionToSnippet(
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
      // Casting means calling the schema with the snippet as an argument.
      return (targetType as unknown as (val: Snippet) => Snippet)(snippet);
    }
    default: {
      assertExhaustive(action.action, 'applyActionToSnippet');
    }
  }
}

export function unify<T extends (AnyData | UnknownData)[]>(
  inTypes: T,
  restrictTo?: AnyData[] | undefined,
): { [K in keyof T]: AnyWgslData } | undefined {
  if (inTypes.some((type) => type.type === 'unknown')) {
    return undefined;
  }

  const conversion = getBestConversion(inTypes as AnyData[], restrictTo);
  if (!conversion) {
    return undefined;
  }

  return inTypes.map(() => conversion.targetType) as {
    [K in keyof T]: AnyWgslData;
  };
}

export function convertToCommonType<T extends Snippet[]>(
  values: T,
  restrictTo?: AnyData[] | undefined,
  verbose = true,
): T | undefined {
  const types = values.map((value) => value.dataType);

  if (types.some((type) => type.type === 'unknown')) {
    return undefined;
  }

  if (DEV && Array.isArray(restrictTo) && restrictTo.length === 0) {
    console.warn(
      'convertToCommonType was called with an empty restrictTo array, which prevents any conversions from being made. If you intend to allow all conversions, pass undefined instead. If this was intended call the function conditionally since the result will always be undefined.',
    );
  }

  const conversion = getBestConversion(types as AnyData[], restrictTo);
  if (!conversion) {
    return undefined;
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

  return values.map((value, index) => {
    const action = conversion.actions[index];
    invariant(action, 'Action should not be undefined');
    return applyActionToSnippet(value, action, conversion.targetType);
  }) as T;
}

export function tryConvertSnippet(
  snippet: Snippet,
  targetDataType: AnyData,
  verbose = true,
): Snippet {
  if (targetDataType === snippet.dataType) {
    return snip(snippet.value, targetDataType);
  }

  if (snippet.dataType.type === 'unknown') {
    // This is it, it's now or never. We expect a specific type, and we're going to get it
    return snip(stitch`${snip(snippet.value, targetDataType)}`, targetDataType);
  }

  const converted = convertToCommonType([snippet], [targetDataType], verbose);

  if (!converted) {
    throw new WgslTypeError(
      `Cannot convert value of type '${snippet.dataType.type}' to type '${targetDataType.type}'`,
    );
  }

  return converted[0] as Snippet;
}

export function convertStructValues(
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
    const converted = convertToCommonType([val], [targetType]);

    return converted?.[0] ?? val;
  });
}
