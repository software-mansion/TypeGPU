import type { Infer } from '../shared/repr';
import type { AnyData, LooseArray } from './dataTypes';

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
): LooseArray<TElement> => new LooseArrayImpl(elementType, count);

/**
 * Checks whether the passed in value is a loose-array schema,
 * as opposed to, e.g., a regular array schema.
 *
 * Array schemas can be used to describe uniform and storage buffers,
 * whereas looseArray schemas cannot. Loose arrays are useful for
 * defining vertex buffers instead.
 *
 * @example
 * isLooseArray(d.arrayOf(d.u32, 4)) // false
 * isLooseArray(d.looseArrayOf(d.u32, 4)) // true
 * isLooseArray(d.vec3f) // false
 */
export function isLooseArray<T extends LooseArray>(
  schema: T | unknown,
): schema is T {
  return (schema as LooseArray)?.type === 'loose-array';
}

// --------------
// Implementation
// --------------

class LooseArrayImpl<TElement extends AnyData> implements LooseArray<TElement> {
  public readonly type = 'loose-array';
  /** Type-token, not available at runtime */
  public readonly __repr!: Infer<TElement>[];

  constructor(
    public readonly elementType: TElement,
    public readonly length: number,
  ) {}
}
