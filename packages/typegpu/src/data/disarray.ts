import { $internal } from '../shared/symbols.ts';
import type { AnyData, Disarray } from './dataTypes.ts';
import { schemaCallWrapper } from './utils.ts';

// ----------
// Public API
// ----------

/**
 * Creates an array schema that can be used to construct vertex buffers.
 * Describes arrays with fixed-size length, storing elements of the same type.
 *
 * Elements in the schema are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 *
 * @example
 * const disarray = d.disarrayOf(d.vec3f, 3); // packed array of vec3f
 *
 * @example
 * const disarray = d.disarrayOf(d.align(16, d.vec3f), 3);
 *
 * If `elementCount` is not specified, a partially applied function is returned.
 *
 * @param elementType The type of elements in the array.
 * @param elementCount The number of elements in the array.
 */
export function disarrayOf<TElement extends AnyData>(
  elementType: TElement,
  elementCount: number,
): Disarray<TElement>;

export function disarrayOf<TElement extends AnyData>(
  elementType: TElement,
  elementCount?: undefined,
): (elementCount: number) => Disarray<TElement>;

export function disarrayOf<TElement extends AnyData>(
  elementType: TElement,
  elementCount?: number | undefined,
): Disarray<TElement> | ((elementCount: number) => Disarray<TElement>) {
  if (elementCount === undefined) {
    return (n: number) => disarrayOf(elementType, n);
  }
  // In the schema call, create and return a deep copy
  // by wrapping all the values in `elementType` schema calls.
  const disarraySchema = (elements?: TElement[]) => {
    if (elements && elements.length !== elementCount) {
      throw new Error(
        `Disarray schema of ${elementCount} elements of type ${elementType.type} called with ${elements.length} argument(s).`,
      );
    }

    return Array.from(
      { length: elementCount },
      (_, i) => schemaCallWrapper(elementType, elements?.[i]),
    );
  };
  Object.setPrototypeOf(disarraySchema, DisarrayImpl);

  disarraySchema.elementType = elementType;

  if (!Number.isInteger(elementCount) || elementCount < 0) {
    throw new Error(
      `Cannot create disarray schema with invalid element count: ${elementCount}.`,
    );
  }
  disarraySchema.elementCount = elementCount;

  return disarraySchema as unknown as Disarray<TElement>;
}

// --------------
// Implementation
// --------------

const DisarrayImpl = {
  [$internal]: true,
  type: 'disarray',

  toString(this: Disarray): string {
    return `disarrayOf(${this.elementType}, ${this.elementCount})`;
  },
};
