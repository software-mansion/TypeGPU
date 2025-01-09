import { isWgslData, isWgslStruct } from '../../data/wgslTypes';
import { isNamable } from '../../namable';
import { type ResolutionCtx, type Wgsl, isResolvable } from '../../types';
import { isSlot } from '../slot/slotTypes';

export type ExternalMap = Record<string, unknown>;

export function applyExternals(
  existing: ExternalMap,
  newExternals: ExternalMap,
) {
  for (const [key, value] of Object.entries(newExternals)) {
    existing[key] = value;

    // Giving name to external value, if it does not already have one.
    if (
      isNamable(value) &&
      (!('label' in value) || value.label === undefined)
    ) {
      value.$name(key);
    }
  }
}

export function addArgTypesToExternals(
  implementation: string,
  argTypes: unknown[],
  applyExternals: (externals: ExternalMap) => void,
) {
  const argTypeNames = implementation
    .match(/^\s*\((?<args>[^\()]*?)\)/s)
    ?.groups?.args?.split(',')
    .map((arg) => arg.split(':')[1]?.trim());

  applyExternals(
    Object.fromEntries(
      argTypes.flatMap((argType, i) => {
        const argTypeName = argTypeNames ? argTypeNames[i] : undefined;
        return isWgslStruct(argType) && argTypeName !== undefined
          ? [[argTypeName, argType]]
          : [];
      }),
    ),
  );
}

export function addReturnTypeToExternals(
  implementation: string,
  returnType: unknown,
  applyExternals: (externals: ExternalMap) => void,
) {
  const outputName = implementation
    .match(/->(?<output>.*?){/s)
    ?.groups?.output?.trim();

  if (isWgslStruct(returnType) && outputName && !/\s/g.test(outputName)) {
    applyExternals({ [outputName]: returnType });
  }
}

export function replaceExternalsInWgsl(
  ctx: ResolutionCtx,
  externalMap: ExternalMap,
  wgsl: string,
) {
  return Object.entries(externalMap).reduce((acc, [externalName, external]) => {
    const resolvedExternal =
      isResolvable(external) || isWgslData(external) || isSlot(external)
        ? ctx.resolve(external as Wgsl)
        : String(external);

    return acc.replaceAll(
      new RegExp(`(?<![\\w_])${externalName}(?![\\w_])`, 'g'),
      resolvedExternal,
    );
  }, wgsl);
}
