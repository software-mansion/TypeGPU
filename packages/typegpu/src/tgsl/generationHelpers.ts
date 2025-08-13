import type { AnyData, UnknownData } from '../data/dataTypes.ts';
import { type MapValueToSnippet, snip, type Snippet } from '../data/snippet.ts';
import {
  type AnyWgslData,
  isMat,
  isVec,
  type WgslStruct,
} from '../data/wgslTypes.ts';
import { invariant, WgslTypeError } from '../errors.ts';
import { DEV } from '../shared/env.ts';
import { $internal } from '../shared/symbols.ts';
import { assertExhaustive } from '../shared/utilityTypes.ts';
import type { ResolutionCtx } from '../types.ts';
import { undecorate } from '../data/decorateUtils.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { getResolutionCtx } from '../execMode.ts';
import { setName } from '../shared/meta.ts';
import type { DualFn } from '../data/dualFn.ts';

const NoneAction = { type: 'none' } as const;
const RefAction = { type: 'ref' } as const;
const DerefAction = { type: 'deref' } as const;

type ConversionAction =
  | { type: 'none' }
  | { type: 'ref' }
  | { type: 'deref' }
  | { type: 'cast'; toType: AnyData };

type ConversionRankInfo = { rank: number; action: ConversionAction };

const INFINITE_RANK: ConversionRankInfo = {
  rank: Number.POSITIVE_INFINITY,
  action: NoneAction,
};

function getAutoConversionRank(
  src: AnyData,
  dest: AnyData,
): ConversionRankInfo {
  const trueSrc = undecorate(src);
  const trueDst = undecorate(dest);

  if (trueSrc.type === trueDst.type) {
    return { rank: 0, action: NoneAction };
  }

  if (trueSrc.type === 'abstractFloat') {
    if (trueDst.type === 'f32') return { rank: 1, action: NoneAction };
    if (trueDst.type === 'f16') return { rank: 2, action: NoneAction };
  }

  if (trueSrc.type === 'abstractInt') {
    if (trueDst.type === 'i32') return { rank: 3, action: NoneAction };
    if (trueDst.type === 'u32') return { rank: 4, action: NoneAction };
    if (trueDst.type === 'abstractFloat') {
      return { rank: 5, action: NoneAction };
    }
    if (trueDst.type === 'f32') return { rank: 6, action: NoneAction };
    if (trueDst.type === 'f16') return { rank: 7, action: NoneAction };
  }

  if (isVec(trueSrc) && isVec(trueDst)) {
    return getAutoConversionRank(trueSrc.primitive, trueDst.primitive);
  }

  if (isMat(trueSrc) && isMat(trueDst)) {
    // Matrix conversion rank depends only on component type (always f32 for now)
    return { rank: 0, action: NoneAction };
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
    return { rank: 0, action: DerefAction };
  }

  if (
    trueDst.type === 'ptr' &&
    getAutoConversionRank(trueSrc, trueDst.inner as AnyData).rank <
      Number.POSITIVE_INFINITY
  ) {
    return { rank: 1, action: RefAction };
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

      return { rank: rank, action: { type: 'cast', toType: trueDst } };
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

export type ConversionResult = {
  targetType: AnyData;
  actions: ConversionAction[];
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

    for (const sourceType of types) {
      const conversion = getConversionRank(
        sourceType,
        targetType,
        allowImplicit,
      );
      currentSum += conversion.rank;
      if (conversion.rank === Number.POSITIVE_INFINITY) {
        break;
      }
      currentDetails.push(conversion);
    }

    if (currentSum < minSum) {
      minSum = currentSum;
      bestType = targetType;
      conversionDetails.set(bestType, currentDetails);
    }
  }

  if (!bestType) {
    return undefined;
  }

  const bestDetails = conversionDetails.get(bestType) as ConversionRankInfo[];
  const actions = bestDetails.map((detail) => detail.action);

  const hasCasts = actions.some((action) => action.type === 'cast');

  return { targetType: bestType, actions, hasImplicitConversions: hasCasts };
}

export type OverloadShape = {
  argTypes: AnyWgslData[];
  returnType: AnyWgslData;
};

export function findBestOverload(
  snippets: Snippet[],
  overloads: OverloadShape[],
): OverloadShape | undefined {
  let bestOverload: OverloadShape | undefined;
  let bestRankSum = Number.POSITIVE_INFINITY;

  for (const overload of overloads) {
    if (overload.argTypes.length !== snippets.length) {
      // Not matching number of arguments
      continue;
    }

    let rankSum = 0;
    for (let i = 0; i < overload.argTypes.length; ++i) {
      const srcType = (snippets[i] as Snippet).dataType; // It's there
      const destType = overload.argTypes[i] as AnyWgslData;
      if (srcType.type === 'unknown') {
        // Oof, this is a hard one. The user passed a value that
        // we were too lazy to infer the type of (for good reason).
        // We're going to try to force the target type on this value
        // anyway, so let's assume the rank is `0` and get on with it.
        continue;
      }
      const conversion = getConversionRank(srcType, destType, true);
      rankSum += conversion.rank;
      if (rankSum === Number.POSITIVE_INFINITY) {
        break; // No sense to check further
      }
    }

    if (rankSum < bestRankSum) {
      bestRankSum = rankSum;
      bestOverload = overload;
    }
  }

  return bestOverload;
}

export function getBestConversion(
  types: AnyData[],
  targetTypes?: AnyData[],
): ConversionResult | undefined {
  if (types.length === 0) return undefined;

  const uniqueTargetTypes = targetTypes
    ? [...new Set(targetTypes.map(undecorate))]
    : [...new Set(types.map(undecorate))];

  // Let's try explicit first...
  const explicitResult = findBestType(types, uniqueTargetTypes, false);
  if (explicitResult) {
    return explicitResult;
  }

  // Okay fine, implicit is good too
  return findBestType(types, uniqueTargetTypes, true);
}

export function convertType(
  sourceType: AnyData,
  targetType: AnyData,
  allowImplicit = true,
): ConversionResult | undefined {
  const conversion = getConversionRank(sourceType, targetType, allowImplicit);

  if (conversion.rank < Number.POSITIVE_INFINITY) {
    return {
      targetType: undecorate(targetType),
      actions: [conversion.action],
      hasImplicitConversions: conversion.action.type === 'cast',
    };
  }

  return undefined;
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
  defineVariable(id: string, dataType: AnyWgslData | UnknownData): Snippet;
};

function applyActionToSnippet(
  ctx: ResolutionCtx,
  value: Snippet,
  action: ConversionAction,
  targetType: AnyData,
): Snippet {
  if (action.type === 'none') {
    return snip(value.value, targetType);
  }

  switch (action.type) {
    case 'ref':
      return snip(stitch`&${value}`, targetType);
    case 'deref':
      return snip(stitch`*${value}`, targetType);
    case 'cast': {
      return snip(stitch`${ctx.resolve(targetType)}(${value})`, targetType);
    }
    default: {
      assertExhaustive(action, 'applyActionToSnippet');
    }
  }
}

export type ConvertToCommonTypeOptions = {
  ctx: ResolutionCtx;
  values: Snippet[];
  restrictTo?: AnyData[] | undefined;
  verbose?: boolean | undefined;
};

export function convertToCommonType({
  ctx,
  values,
  restrictTo,
  verbose = true,
}: ConvertToCommonTypeOptions): Snippet[] | undefined {
  const types = values.map((value) => value.dataType);

  if (types.some((type) => type.type === 'unknown')) {
    return undefined;
  }

  if (DEV && verbose && Array.isArray(restrictTo) && restrictTo.length === 0) {
    console.warn(
      'convertToCommonType was called with an empty restrictTo array, which prevents any conversions from being made. If you intend to allow all conversions, pass undefined instead. If this was intended call the function conditionally since the result will always be undefined.',
    );
  }

  const conversion = getBestConversion(types as AnyData[], restrictTo);
  if (!conversion) {
    return undefined;
  }

  if (DEV && verbose && conversion.hasImplicitConversions) {
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

  const converted = convertToCommonType({
    ctx,
    values: [snippet],
    restrictTo: [targetDataType],
  });

  if (!converted) {
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
    const converted = convertToCommonType({
      ctx,
      values: [val],
      restrictTo: [targetType as AnyData],
    });
    return converted?.[0] ?? val;
  });
}

interface NewDualImplOptions<T extends (...args: never[]) => unknown> {
  name: string;
  normal: T;
  codegen: (...args: MapValueToSnippet<Parameters<T>>) => string | T;
  overloads:
    | OverloadShape[]
    | ((...args: MapValueToSnippet<Parameters<T>>) => OverloadShape[]);
}

export function dualImpl<T extends (...args: never[]) => unknown>(
  options: NewDualImplOptions<T>,
) {
  const impl = ((...args: Parameters<T>) => {
    const ctx = getResolutionCtx();
    if (ctx?.mode.type === 'codegen') {
      const argSnippets = args as MapValueToSnippet<Parameters<T>>;
      const overloads = typeof options.overloads === 'function'
        ? options.overloads(...argSnippets)
        : options.overloads;
      const overload = findBestOverload(argSnippets, overloads);
      if (!overload) {
        throw new Error(
          `No matching ${options.name} overload for types: [${
            argSnippets.map((s) => s.dataType).join(', ')
          }]`,
        );
      }
      // Converting arguments to match the chosen overload
      const conv = argSnippets.map((s, i) =>
        tryConvertSnippet(ctx, s, overload.argTypes[i] as AnyWgslData)
      );

      return snip(
        options.codegen(...conv as MapValueToSnippet<Parameters<T>>),
        overload.returnType,
      );
    }
    return options.normal(...args);
  }) as T;

  setName(impl, options.name);
  impl.toString = () => options.name;
  Object.defineProperty(impl, $internal, {
    value: {
      jsImpl: options.normal,
      gpuImpl: options.codegen,
      argConversionHint: 'keep',
    },
  });

  return impl as DualFn<T>;
}
