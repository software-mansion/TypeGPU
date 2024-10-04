import { MissingLinksError } from '../../errors';
import { isNamable } from '../../namable';
import { type ResolutionCtx, isResolvable } from '../../types';

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

export function throwIfMissingExternals(
  externalMap: ExternalMap,
  expectedNames: string[],
) {
  const missingExternals = expectedNames.filter(
    (name) => !(name in externalMap),
  );

  if (missingExternals.length > 0) {
    throw new MissingLinksError(missingExternals);
  }
}

export function replaceExternalsInWgsl(
  ctx: ResolutionCtx,
  externalMap: ExternalMap,
  wgsl: string,
) {
  return Object.entries(externalMap).reduce((acc, [externalName, external]) => {
    if (!isResolvable(external)) {
      return acc;
    }

    const resolvedExternal = ctx.resolve(external);
    return acc.replaceAll(
      new RegExp(`(?<![\\w_])${externalName}(?![\\w_])`, 'g'),
      resolvedExternal,
    );
  }, wgsl);
}
