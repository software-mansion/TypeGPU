import type { Infer, InferPartial, MemIdentity } from '../shared/repr';
import { sizeOf } from './sizeOf';
import type { AnyWgslData, BaseData, WgslArray } from './wgslTypes';

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
  return new WgslArrayImpl(elementType, elementCount);
}

// --------------
// Implementation
// --------------

class WgslArrayImpl<TElement extends BaseData> implements WgslArray<TElement> {
  public readonly type = 'array';
  /** Type-token, not available at runtime */
  public readonly '~repr'!: Infer<TElement>[];
  /** Type-token, not available at runtime */
  public readonly '~reprPartial'!: {
    idx: number;
    value: InferPartial<TElement>;
  }[];
  /** Type-token, not available at runtime */
  public readonly '~memIdent'!: WgslArray<MemIdentity<TElement>>;

  constructor(
    public readonly elementType: TElement,
    public readonly elementCount: number,
  ) {
    if (Number.isNaN(sizeOf(elementType))) {
      throw new Error('Cannot nest runtime sized arrays.');
    }
  }

  toString() {
    return `arrayOf(${this.elementType})`;
  }
}
