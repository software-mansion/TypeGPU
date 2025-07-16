import { $internal } from '../shared/symbols.ts';
import { sizeOf } from './sizeOf.ts';
import type { AnyWgslData, WgslArray } from './wgslTypes.ts';

// ----------
// Public API
// ----------

/**
 * Creates an array schema that can be used to construct gpu buffers.
 * Describes arrays with fixed-size length, storing elements of the same type.
 *
 * @example
 * const LENGTH = 3;
 * const array = d.arrayOf(d.u32, LENGTH);
 *
 * @param elementType The type of elements in the array.
 * @param elementCount The number of elements in the array.
 */
export function arrayOf<TElement extends AnyWgslData>(
  elementType: TElement,
  elementCount: number,
): WgslArray<TElement> {
  // in the schema call, create and return a deep copy
  // by wrapping all the values in corresponding schema calls
  const arraySchema = () => {
    console.log('Schema called!');
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

  // @ts-ignore
  return arraySchema as WgslArray<TElement>;
}

// --------------
// Implementation
// --------------

const WgslArrayImpl = {
  [$internal]: true,
  type: 'array',
  elementCount: undefined,
  elementType: undefined,

  toString(): string {
    return `arrayOf(${this.elementType})`;
  },
};
