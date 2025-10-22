import { createDualImpl } from '../core/function/dualImpl.ts';
import { $internal } from '../shared/symbols.ts';
import { UnknownData } from './dataTypes.ts';
import { sizeOf } from './sizeOf.ts';
import { snip, type Snippet } from './snippet.ts';
import { schemaCallWrapper } from './schemaCallWrapper.ts';
import type { AnyWgslData, WgslArray } from './wgslTypes.ts';

// ----------
// Public API
// ----------

interface WgslArrayConstructor {
  <TElement extends AnyWgslData>(
    elementType: TElement,
  ): (elementCount: number) => WgslArray<TElement>;

  <TElement extends AnyWgslData>(
    elementType: TElement,
    elementCount: number,
  ): WgslArray<TElement>;
}

/**
 * Creates an array schema that can be used to construct gpu buffers.
 * Describes arrays with fixed-size length, storing elements of the same type.
 *
 * @example
 * const LENGTH = 3;
 * const array = d.arrayOf(d.u32, LENGTH);
 *
 * If `elementCount` is not specified, a partially applied function is returned.
 * @example
 * const array = d.arrayOf(d.vec3f);
 * //    ^? (n: number) => WgslArray<d.Vec3f>
 *
 * @param elementType The type of elements in the array.
 * @param elementCount The number of elements in the array.
 */
export const arrayOf = createDualImpl(
  // JS implementation
  ((elementType, elementCount) => {
    if (elementCount === undefined) {
      return (count: number) => cpu_arrayOf(elementType, count);
    }
    return cpu_arrayOf(elementType, elementCount);
  }) as WgslArrayConstructor,
  // CODEGEN implementation
  (elementType, elementCount) => {
    if (elementCount?.value === undefined) {
      const partial = (count: Snippet) =>
        arrayOf[$internal].gpuImpl(elementType, count);
      // Marking so the WGSL generator lets this function through
      partial[$internal] = true;

      return snip(partial, UnknownData);
    }

    if (typeof elementCount.value !== 'number') {
      throw new Error(
        `Cannot create array schema with count unknown at compile-time: '${elementCount.value}'`,
      );
    }

    return snip(
      cpu_arrayOf(elementType.value as AnyWgslData, elementCount.value),
      elementType.value as AnyWgslData,
    );
  },
  'arrayOf',
);

// --------------
// Implementation
// --------------

function cpu_arrayOf<TElement extends AnyWgslData>(
  elementType: TElement,
  elementCount: number,
): WgslArray<TElement> {
  // In the schema call, create and return a deep copy
  // by wrapping all the values in `elementType` schema calls.
  const arraySchema = (elements?: TElement[]) => {
    if (elements && elements.length !== elementCount) {
      throw new Error(
        `Array schema of ${elementCount} elements of type ${elementType.type} called with ${elements.length} argument(s).`,
      );
    }

    return Array.from(
      { length: elementCount },
      (_, i) => schemaCallWrapper(elementType, elements?.[i]),
    );
  };
  Object.setPrototypeOf(arraySchema, WgslArrayImpl);

  if (Number.isNaN(sizeOf(elementType))) {
    throw new Error('Cannot nest runtime sized arrays.');
  }
  arraySchema.elementType = elementType;

  if (!Number.isInteger(elementCount) || elementCount < 0) {
    throw new Error(
      `Cannot create array schema with invalid element count: ${elementCount}.`,
    );
  }
  arraySchema.elementCount = elementCount;

  return arraySchema as unknown as WgslArray<TElement>;
}

const WgslArrayImpl = {
  [$internal]: true,
  type: 'array',

  toString(this: WgslArray): string {
    return `arrayOf(${this.elementType}, ${this.elementCount})`;
  },
};
