import type { AnyAttribute } from './attributes.ts';
import { isDisarray, isLooseDecorated, isUnstruct } from './dataTypes.ts';
import type { AnyData } from './dataTypes.ts';
import { isWgslStorageTexture, isWgslTexture } from './texture.ts';
import { isAtomic, isDecorated, isPtr, isWgslArray, isWgslStruct } from './wgslTypes.ts';

/**
 * Performs a structural comparison of two TypeGPU data schemas. This
 * means two struct definitions are considered equal when they have the
 * same properties. Use `schemasEqualNominally` for a nominal comparison.
 *
 * @param a The first data schema to compare.
 * @param b The second data schema to compare.
 * @returns `true` if the schemas are structurally equal, `false` otherwise.
 *
 * @example
 * import { vec3f, struct, schemasEqualStructurally } from 'typegpu/data';
 *
 * console.log(schemasEqualStructurally(struct({ a: vec3f }), struct({ a: vec3f }))); // true
 * console.log(schemasEqualStructurally(struct({ a: vec3f }), struct({ b: vec3f }))); // false
 */
export function schemasEqualStructurally(a: AnyData, b: AnyData): boolean {
  return schemasEqual(a, b, true);
}

/**
 * Performs a nominal comparison of two TypeGPU data schemas. This
 * means two struct definitions are only considered equal when they
 * have the same object identity. Use `schemasEqualStructurally` for
 * a structural comparison.
 *
 * @param a The first data schema to compare.
 * @param b The second data schema to compare.
 * @returns `true` if the schemas are nominally equal, `false` otherwise.
 *
 * @example
 * import { vec3f, struct, schemasEqualNominally } from 'typegpu/data';
 *
 * const struct1 = struct({ a: vec3f });
 * const struct2 = struct({ a: vec3f });
 *
 * console.log(schemasEqualNominally(d.arrayOf(struct1, 2), d.arrayOf(struct1, 2))); // true
 * console.log(schemasEqualNominally(struct1, struct2)); // false
 */
export function schemasEqualNominally(a: AnyData, b: AnyData): boolean {
  return schemasEqual(a, b, false);
}

function schemasEqual(a: AnyData, b: AnyData, structural: boolean): boolean {
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
    // Only the first (outermost) attribute of each type is effective.
    const attribsA = effectiveAttribs(a.attribs as AnyAttribute[]);
    const attribsB = effectiveAttribs(b.attribs as AnyAttribute[]);

    if (attribsA.size !== attribsB.size) {
      return false;
    }

    for (const [type, attrA] of attribsA) {
      const attrB = attribsB.get(type);
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

function effectiveAttribs(attribs: AnyAttribute[]): Map<string, AnyAttribute> {
  const result = new Map<string, AnyAttribute>();
  for (const attrib of attribs) {
    if (!result.has(attrib.type)) {
      result.set(attrib.type, attrib);
    }
  }
  return result;
}
