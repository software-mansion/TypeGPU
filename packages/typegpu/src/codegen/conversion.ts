import { stitch } from '../core/resolve/stitch.ts';
import { UnknownData } from '../data/dataTypes.ts';
import { undecorate } from '../data/dataTypes.ts';
import { derefSnippet, RefOperator } from '../data/ref.ts';
import { schemaCallWrapperGPU } from '../data/schemaCallWrapper.ts';
import {
  areSnippetTypesEqual,
  snip,
  type KnownSnippetType,
  type Snippet,
  type SnippetType,
} from '../data/snippet.ts';
import {
  type AnyWgslData,
  type BaseData,
  type F16,
  type F32,
  type I32,
  isMat,
  isPtr,
  isVec,
  type Ptr,
  type U32,
  type WgslStruct,
} from '../data/wgslTypes.ts';
import { invariant, WgslTypeError } from '../errors.ts';
import { DEV, TEST } from '../shared/env.ts';
import { safeStringify } from '../shared/stringify.ts';
import { assertExhaustive } from '../shared/utilityTypes.ts';
import type { ResolutionCtx } from '../types.ts';

type ConversionAction = 'ref' | 'deref' | 'cast' | 'none';

type ConversionRankInfo =
  | { rank: number; action: 'cast'; targetType: KnownSnippetType }
  | { rank: number; action: Exclude<ConversionAction, 'cast'> };

const INFINITE_RANK: ConversionRankInfo = {
  rank: Number.POSITIVE_INFINITY,
  action: 'none',
};

function getAutoConversionRank(src: KnownSnippetType, dest: KnownSnippetType): ConversionRankInfo {
  const trueSrc = undecorate(src as BaseData) as KnownSnippetType;
  const trueDst = undecorate(dest as BaseData) as KnownSnippetType;

  if (areSnippetTypesEqual(trueSrc, trueDst)) {
    return { rank: 0, action: 'none' };
  }

  if (trueSrc === 'abstractFloat') {
    if (trueDst === 'f32') return { rank: 1, action: 'none' };
    if (trueDst === 'f16') return { rank: 2, action: 'none' };
  }

  if (trueSrc === 'abstractInt') {
    if (trueDst === 'i32') return { rank: 3, action: 'none' };
    if (trueDst === 'u32') return { rank: 4, action: 'none' };
    if (trueDst === 'abstractFloat') return { rank: 5, action: 'none' };
    if (trueDst === 'f32') return { rank: 6, action: 'none' };
    if (trueDst === 'f16') return { rank: 7, action: 'none' };
  }

  if (
    isVec(trueSrc) &&
    isVec(trueDst) &&
    // Same length vectors
    trueSrc.type[3] === trueDst.type[3]
  ) {
    return getAutoConversionRank(trueSrc.primitive, trueDst.primitive);
  }

  if (
    isMat(trueSrc) &&
    isMat(trueDst) &&
    // Same dimensions
    trueSrc.type[3] === trueDst.type[3]
  ) {
    // Matrix conversion rank depends only on component type (always f32 for now)
    return { rank: 0, action: 'none' };
  }

  return INFINITE_RANK;
}

function getImplicitConversionRank(
  src: KnownSnippetType,
  dest: KnownSnippetType,
): ConversionRankInfo {
  const trueSrc = undecorate(src as BaseData) as KnownSnippetType;
  const trueDst = undecorate(dest as BaseData) as KnownSnippetType;

  if (
    isPtr(trueSrc) &&
    // Only dereferencing implicit pointers, otherwise we'd have a types mismatch between TS and WGSL
    trueSrc.implicit &&
    getAutoConversionRank(trueSrc.inner, trueDst).rank < Number.POSITIVE_INFINITY
  ) {
    return { rank: 0, action: 'deref' };
  }

  if (
    isPtr(trueDst) &&
    getAutoConversionRank(trueSrc, trueDst.inner).rank < Number.POSITIVE_INFINITY
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
    typeof trueSrc === 'string' &&
    trueSrc in primitivePreference &&
    typeof trueDst === 'string' &&
    trueDst in primitivePreference
  ) {
    const srcType = trueSrc as PrimitiveType;
    const destType = trueDst as PrimitiveType;

    if (srcType !== destType) {
      const srcPref = primitivePreference[srcType];
      const destPref = primitivePreference[destType];

      const rank = destPref < srcPref ? 10 : 20;

      return { rank: rank, action: 'cast', targetType: trueDst };
    }
  }

  if (trueSrc === 'abstractFloat') {
    if (trueDst === 'u32') {
      return { rank: 2, action: 'cast', targetType: trueDst };
    }
    if (trueDst === 'i32') {
      return { rank: 1, action: 'cast', targetType: trueDst };
    }
  }

  return INFINITE_RANK;
}

function getConversionRank(
  src: KnownSnippetType,
  dest: KnownSnippetType,
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
  targetType: KnownSnippetType;
  actions: ConversionResultAction[];
  hasImplicitConversions?: boolean;
};

function findBestType(
  types: KnownSnippetType[],
  uniqueTypes: KnownSnippetType[],
  allowImplicit: boolean,
): ConversionResult | undefined {
  let bestResult:
    | { type: KnownSnippetType; details: ConversionRankInfo[]; sum: number }
    | undefined;

  for (const targetType of uniqueTypes) {
    const details: ConversionRankInfo[] = [];
    let sum = 0;
    for (const sourceType of types) {
      const conversion = getConversionRank(sourceType, targetType, allowImplicit);
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
  const actions: ConversionResultAction[] = bestResult.details.map((detail, index) => ({
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
  types: KnownSnippetType[],
  targetTypes?: KnownSnippetType[],
): ConversionResult | undefined {
  if (types.length === 0) return undefined;

  const uniqueTargetTypes: KnownSnippetType[] = [
    // Casting here is fine, because undecorate will return the same type if it's not decorated
    ...new Set((targetTypes || types).map((t) => undecorate(t as BaseData))),
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
  ctx: ResolutionCtx,
  snippet: Snippet,
  action: ConversionResultAction,
  targetType: KnownSnippetType,
): Snippet {
  if (action.action === 'none') {
    return snip(
      snippet.value,
      targetType,
      // if it was a ref, then it's still a ref
      /* origin */ snippet.origin,
    );
  }

  switch (action.action) {
    case 'ref':
      return snip(new RefOperator(snippet, targetType as Ptr), targetType, snippet.origin);
    case 'deref':
      return derefSnippet(snippet);
    case 'cast': {
      // Casting means calling the schema with the snippet as an argument.
      return schemaCallWrapperGPU(ctx, targetType, snippet);
    }
    default: {
      assertExhaustive(action.action, 'applyActionToSnippet');
    }
  }
}

export function unify<T extends SnippetType[] | []>(
  inTypes: T,
  restrictTo?: KnownSnippetType[],
): { [K in keyof T]: KnownSnippetType } | undefined {
  if (inTypes.some((type) => type === UnknownData)) {
    return undefined;
  }

  const conversion = getBestConversion(inTypes as KnownSnippetType[], restrictTo);
  if (!conversion) {
    return undefined;
  }

  return inTypes.map((type) => (isVec(type) || isMat(type) ? type : conversion.targetType)) as {
    [K in keyof T]: KnownSnippetType;
  };
}

export function convertToCommonType<T extends Snippet[]>(
  ctx: ResolutionCtx,
  values: T,
  restrictTo?: KnownSnippetType[],
  verbose = true,
): T | undefined {
  const types = values.map((value) => value.dataType);

  if (types.some((type) => type === UnknownData)) {
    return undefined;
  }
  // We know here that all types are known
  const knownTypes = types as KnownSnippetType[];

  if (DEV && Array.isArray(restrictTo) && restrictTo.length === 0) {
    console.warn(
      'convertToCommonType was called with an empty restrictTo array, which prevents any conversions from being made. If you intend to allow all conversions, pass undefined instead. If this was intended call the function conditionally since the result will always be undefined.',
    );
  }

  const conversion = getBestConversion(knownTypes, restrictTo);
  if (!conversion) {
    return undefined;
  }

  if ((TEST || DEV) && verbose && conversion.hasImplicitConversions) {
    console.warn(
      `Implicit conversions from [\n${values
        .map((v) => `  ${v.value}: ${safeStringify(v.dataType)}`)
        .join(',\n')}\n] to ${conversion.targetType} are supported, but not recommended.
Consider using explicit conversions instead.`,
    );
  }

  return values.map((value, index) => {
    const action = conversion.actions[index];
    invariant(action, 'Action should not be undefined');
    return applyActionToSnippet(ctx, value, action, conversion.targetType);
  }) as T;
}

export function tryConvertSnippet(
  ctx: ResolutionCtx,
  snippet: Snippet,
  targetDataTypes: KnownSnippetType | KnownSnippetType[],
  verbose = true,
): Snippet {
  const targets = Array.isArray(targetDataTypes) ? targetDataTypes : [targetDataTypes];

  const { value, dataType, origin } = snippet;

  if (targets.length === 1) {
    const target = targets[0] as AnyWgslData;

    if (target === dataType) {
      return snip(value, target, origin);
    }

    if (dataType === UnknownData) {
      // Commit unknown to the expected type.
      return snip(stitch`${snip(value, target, origin)}`, target, origin);
    }
  }

  const converted = convertToCommonType(ctx, [snippet], targets, verbose);
  if (converted) {
    return converted[0] as Snippet;
  }

  throw new WgslTypeError(
    `Cannot convert value of type '${String(
      dataType,
    )}' to any of the target types: [${targets.map((t) => String(t)).join(', ')}]`,
  );
}

export function convertStructValues(
  ctx: ResolutionCtx,
  structType: WgslStruct,
  values: Record<string, Snippet>,
): Snippet[] {
  return Object.entries(structType.propTypes).map(([key, targetType]) => {
    const val = values[key];
    if (!val) {
      throw new Error(`Missing property ${key}`);
    }

    const converted = convertToCommonType(ctx, [val], [targetType]);
    return converted?.[0] ?? val;
  });
}
