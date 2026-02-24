import type { AnyAttribute } from './attributes.ts';
import { isDisarray, isLooseDecorated, isUnstruct } from './dataTypes.ts';
import type { AnyData } from './dataTypes.ts';
import {
  isAtomic,
  isDecorated,
  isPtr,
  isWgslArray,
  isWgslStruct,
} from './wgslTypes.ts';

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

  if (
    (isWgslStruct(a) && isWgslStruct(b)) ||
    (isUnstruct(a) && isUnstruct(b))
  ) {
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
        keyA !== keyB || !keyA || !keyB ||
        !deepEqual(aProps[keyA] as AnyData, bProps[keyB] as AnyData)
      ) {
        return false;
      }
    }
    return true;
  }

  if ((isWgslArray(a) && isWgslArray(b)) || (isDisarray(a) && isDisarray(b))) {
    return (
      a.elementCount === b.elementCount &&
      deepEqual(a.elementType as AnyData, b.elementType as AnyData)
    );
  }

  if (isPtr(a) && isPtr(b)) {
    return (
      a.addressSpace === b.addressSpace &&
      a.access === b.access &&
      deepEqual(a.inner as AnyData, b.inner as AnyData)
    );
  }

  if (isAtomic(a) && isAtomic(b)) {
    return deepEqual(a.inner, b.inner);
  }

  if (
    (isDecorated(a) && isDecorated(b)) ||
    (isLooseDecorated(a) && isLooseDecorated(b))
  ) {
    if (!deepEqual(a.inner as AnyData, b.inner as AnyData)) {
      return false;
    }
    if (a.attribs.length !== b.attribs.length) {
      return false;
    }

    // Create comparable string representations for each attribute
    const getAttrKey = (attr: unknown): string => {
      const anyAttr = attr as AnyAttribute;
      return `${anyAttr.type}(${(anyAttr.params ?? []).join(',')})`;
    };

    const attrsA = a.attribs.map(getAttrKey);
    const attrsB = b.attribs.map(getAttrKey);

    for (let i = 0; i < attrsA.length; i++) {
      if (attrsA[i] !== attrsB[i]) {
        return false;
      }
    }
  }

  // All other types have been checked for equality at the start
  return true;
}
