import { isWgslData } from '../../data/wgslTypes';
import { isNamable } from '../../namable';
import { type ResolutionCtx, type Wgsl, isResolvable } from '../../types';
import { isSlot } from '../slot/slotTypes';

/**
 * A key-value mapping where keys represent identifiers within shader code,
 * and values can be any type that can be resolved to a string.
 */
export type ExternalMap = Record<string, unknown>;

/**
 * Merges two external maps into one. If a key is present in both maps, the value from the new map is used.
 * If the external value is a namable object, it is given a name if it does not already have one.
 * @param existing - The existing external map.
 * @param newExternals - The new external map.
 */
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

/**
 * Replaces all occurrences of external names in WGSL code with their resolved values.
 * It adds all necessary definitions to the resolution context.
 * @param ctx - The resolution context.
 * @param externalMap - The external map.
 * @param wgsl - The WGSL code.
 *
 * @returns The WGSL code with all external names replaced with their resolved values.
 */
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
