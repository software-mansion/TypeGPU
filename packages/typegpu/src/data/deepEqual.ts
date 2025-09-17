import type { AnyAttribute } from './attributes.ts';
import { isDisarray, isLooseData, isUnstruct } from './dataTypes.ts';
import type { AnyData } from './dataTypes.ts';
import { isDecorated, isWgslArray, isWgslStruct } from './wgslTypes.ts';

/**
 * Performs a deep comparison of two TypeGPU data schemas.
 *
 * @param a The first data schema to compare.
 * @param b The second data schema to compare.
 * @returns `true` if the schemas are deeply equal, `false` otherwise.
 *
 * @example
 * ```ts
 * import { vec3f, struct, deepEqual } from 'typegpu/data';
 *
 * const schema1 = struct({ a: vec3f });
 * const schema2 = struct({ a: vec3f });
 * const schema3 = struct({ b: vec3f });
 *
 * console.log(deepEqual(schema1, schema2)); // true
 * console.log(deepEqual(schema1, schema3)); // false
 * ```
 */
export function deepEqual(a: AnyData, b: AnyData): boolean {
  if (a === b) {
    return true;
  }

  if (a.type !== b.type) {
    return false;
  }

  if (isWgslStruct(a) && isWgslStruct(b)) {
    const aProps = a.propTypes;
    const bProps = b.propTypes;
    const aKeys = Object.keys(aProps);
    const bKeys = Object.keys(bProps);

    if (aKeys.length !== bKeys.length) {
      return false;
    }

    aKeys.sort();
    bKeys.sort();

    if (aKeys.join() !== bKeys.join()) {
      return false;
    }

    for (const key of aKeys) {
      if (!deepEqual(aProps[key], bProps[key])) {
        return false;
      }
    }
    return true;
  }

  if (isWgslArray(a) && isWgslArray(b)) {
    return (
      a.elementCount === b.elementCount &&
      deepEqual(a.elementType as AnyData, b.elementType as AnyData)
    );
  }

  if (isDecorated(a) && isDecorated(b)) {
    if (!deepEqual(a.inner as AnyData, b.inner as AnyData)) {
      return false;
    }
    if (a.attribs.length !== b.attribs.length) {
      return false;
    }
    // TODO: A more robust comparison might be needed if attribute order is not guaranteed.
    // For now, assuming attributes are ordered.
    for (let i = 0; i < a.attribs.length; i++) {
      const attrA = a.attribs[i] as AnyAttribute;
      const attrB = b.attribs[i] as AnyAttribute;
      if (attrA.type !== attrB.type) return false;
      if (attrA.params?.length !== attrB.params?.length) return false;
      if (attrA.params) {
        for (let j = 0; j < attrA.params.length; j++) {
          if (attrA.params[j] !== attrB.params[j]) return false;
        }
      }
    }
    return true;
  }

  if (isUnstruct(a) && isUnstruct(b)) {
    const aProps = a.propTypes;
    const bProps = b.propTypes;
    const aKeys = Object.keys(aProps);
    const bKeys = Object.keys(bProps);

    if (aKeys.length !== bKeys.length) {
      return false;
    }

    // For unstructs, order of properties matters.
    if (aKeys.join() !== bKeys.join()) {
      return false;
    }

    for (const key of aKeys) {
      if (!deepEqual(aProps[key], bProps[key])) {
        return false;
      }
    }
    return true;
  }

  if (isDisarray(a) && isDisarray(b)) {
    return (
      a.elementCount === b.elementCount &&
      deepEqual(a.elementType as AnyData, b.elementType as AnyData)
    );
  }

  if (isLooseData(a) && isLooseData(b)) {
    // TODO: This is a simplified check. A a more detailed comparison might be necessary.
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return true;
}
