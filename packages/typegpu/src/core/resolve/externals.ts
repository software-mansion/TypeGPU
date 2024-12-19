import { isWgslData } from '../../data/wgslTypes';
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
