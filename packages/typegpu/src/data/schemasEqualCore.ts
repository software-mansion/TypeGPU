import { $internal } from '../shared/symbols.ts';
import type { AnyAttribute } from './attributes.ts';
import { isDisarray, isLooseDecorated, isUnstruct } from './dataTypes.ts';
import type { AnyData } from './dataTypes.ts';
import { isAtomic, isDecorated, isPtr, isWgslArray, isWgslStruct } from './wgslTypes.ts';

// These mirror the guards in `texture.ts`. They're kept local so this module
// doesn't import `texture.ts`, which would close a module cycle back to
// `conversion.ts` (`conversion -> schemasEqualCore -> texture -> numeric ->
// createCallableSchema -> conversion`).
function isWgslTexture(value: unknown): value is { sampleType: unknown } {
  return (
    !!(value as Record<PropertyKey, unknown>)[$internal] &&
    typeof (value as { multisampled?: unknown }).multisampled === 'boolean'
  );
}

function isWgslStorageTexture(value: unknown): value is { format: string; access: string } {
  return (
    !!(value as Record<PropertyKey, unknown>)[$internal] &&
    typeof (value as { format?: unknown }).format === 'string' &&
    typeof (value as { access?: unknown }).access === 'string'
  );
}

/**
 * Structural/nominal comparison of two TypeGPU data schemas.
 *
 * This module deliberately does not import `comptime` (nor `texture.ts`), so it
 * can be used from low-level modules (e.g. `tgsl/conversion.ts`) that are part
 * of early module initialization cycles. The comptime-callable public API lives
 * in `schemasEqual.ts`.
 *
 * @param a The first data schema to compare.
 * @param b The second data schema to compare.
 * @param structural When `true`, structs compare by shape; when `false`, only by identity.
 * @returns `true` if the schemas are equal, `false` otherwise.
 */
export function schemasEqual(a: AnyData, b: AnyData, structural: boolean): boolean {
  if (a === b) {
    return true;
  }

  if (a.type !== b.type) {
    return false;
  }

  if ((isWgslStruct(a) && isWgslStruct(b)) || (isUnstruct(a) && isUnstruct(b))) {
    if (!structural) {
      // With nominal typing, structs are only considered equal when they
      // generate the same declaration, i.e. have the same object identity.
      // If they didn't pass the previous condition, then they're not equal
      return false;
    }

    const aProps = a.propTypes;
    const bProps = b.propTypes;
    const aKeys = Object.keys(aProps);
    const bKeys = Object.keys(bProps);

    if (aKeys.length !== bKeys.length) {
      return false;
    }

    for (let i = 0; i < aKeys.length; i++) {
      const keyA = aKeys[i];
      const keyB = bKeys[i];
      if (
        keyA !== keyB ||
        !keyA ||
        !keyB ||
        !schemasEqual(aProps[keyA] as AnyData, bProps[keyB] as AnyData, structural)
      ) {
        return false;
      }
    }
    return true;
  }

  if ((isWgslArray(a) && isWgslArray(b)) || (isDisarray(a) && isDisarray(b))) {
    return (
      a.elementCount === b.elementCount &&
      schemasEqual(a.elementType as AnyData, b.elementType as AnyData, structural)
    );
  }

  if (isPtr(a) && isPtr(b)) {
    return (
      a.addressSpace === b.addressSpace &&
      a.access === b.access &&
      a.implicit === b.implicit &&
      schemasEqual(a.inner as AnyData, b.inner as AnyData, structural)
    );
  }

  if (isAtomic(a) && isAtomic(b)) {
    return schemasEqual(a.inner, b.inner, structural);
  }

  if (isWgslTexture(a) && isWgslTexture(b)) {
    // Dimension and multisampling are already encoded in the type
    return schemasEqual(a.sampleType as AnyData, b.sampleType as AnyData, structural);
  }

  if (isWgslStorageTexture(a) && isWgslStorageTexture(b)) {
    // Dimension is already encoded in the type
    return a.format === b.format && a.access === b.access;
  }

  if ((isDecorated(a) && isDecorated(b)) || (isLooseDecorated(a) && isLooseDecorated(b))) {
    if (!schemasEqual(a.inner as AnyData, b.inner as AnyData, structural)) {
      return false;
    }
    // Attribute order carries no meaning, so we compare attributes by type.
    // A decorator replaces an existing one of the same type, so each type appears once.
    const attribsA = a.attribs as AnyAttribute[];
    const attribsB = b.attribs as AnyAttribute[];

    if (attribsA.length !== attribsB.length) {
      return false;
    }

    for (const attrA of attribsA) {
      const attrB = attribsB.find((attr) => attr.type === attrA.type);
      if (!attrB) {
        return false;
      }
      const paramsA: readonly unknown[] = attrA.params ?? [];
      const paramsB: readonly unknown[] = attrB.params ?? [];
      if (
        paramsA.length !== paramsB.length ||
        paramsA.some((param, idx) => param !== paramsB[idx])
      ) {
        return false;
      }
    }
    return true;
  }

  // All other types have been checked for equality at the start
  return true;
}
