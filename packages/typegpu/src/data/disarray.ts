import type { Infer } from '../shared/repr';
import type { AnyData, Disarray } from './dataTypes';
import type { Exotic } from './exotic';

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
 * @param elementType The type of elements in the array.
 * @param count The number of elements in the array.
 */
export const disarrayOf = <TElement extends AnyData>(
  elementType: TElement,
  count: number,
): Disarray<Exotic<TElement>> =>
  new DisarrayImpl(elementType as Exotic<TElement>, count);

// --------------
// Implementation
// --------------

class DisarrayImpl<TElement extends AnyData> implements Disarray<TElement> {
  public readonly type = 'disarray';
  /** Type-token, not available at runtime */
  public readonly '~repr'!: Infer<TElement>[];

  constructor(
    public readonly elementType: TElement,
    public readonly elementCount: number,
  ) {}
}
