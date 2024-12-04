import type { Infer } from '../shared/repr';
import type { AnyData, LooseArray } from './dataTypes';
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
 * const looseArray = d.looseArrayOf(d.vec3f, 3); // packed array of vec3f
 *
 * @example
 * const looseArray = d.looseArrayOf(d.align(16, d.vec3f), 3);
 *
 * @param elementType The type of elements in the array.
 * @param count The number of elements in the array.
 */
export const looseArrayOf = <TElement extends AnyData>(
  elementType: TElement,
  count: number,
): LooseArray<Exotic<TElement>> =>
  new LooseArrayImpl(elementType as Exotic<TElement>, count);

// --------------
// Implementation
// --------------

class LooseArrayImpl<TElement extends AnyData> implements LooseArray<TElement> {
  public readonly type = 'loose-array';
  /** Type-token, not available at runtime */
  public readonly '~repr'!: Infer<TElement>[];

  constructor(
    public readonly elementType: TElement,
    public readonly length: number,
  ) {}
}
