import type { Infer } from '../shared/repr';
import type { Exotic } from './exotic';
import { sizeOf } from './sizeOf';
import type { AnyWgslData, WgslArray } from './wgslTypes';

// ----------
// Public API
// ----------

/**
 * Array schema constructed via `d.arrayOf` function.
 *
 * Responsible for handling reading and writing array values
 * between binary and JS representation. Takes into account
 * the `byteAlignment` requirement of its elementType.
 */
export interface TgpuArray<TElement extends AnyWgslData>
  extends WgslArray<TElement> {
  readonly '~exotic': WgslArray<Exotic<TElement>>;
}

/**
 * Creates an array schema that can be used to construct gpu buffers.
 * Describes arrays with fixed-size length, storing elements of the same type.
 *
 * @example
 * const LENGTH = 3;
 * const array = d.arrayOf(d.u32, LENGTH);
 *
 * @param elementType The type of elements in the array.
 * @param length The number of elements in the array.
 */
export const arrayOf = <TElement extends AnyWgslData>(
  elementType: TElement,
  length: number,
): TgpuArray<Exotic<TElement>> =>
  new TgpuArrayImpl(elementType as Exotic<TElement>, length);

// --------------
// Implementation
// --------------

class TgpuArrayImpl<TElement extends AnyWgslData>
  implements TgpuArray<TElement>
{
  public readonly type = 'array';
  /** Type-token, not available at runtime */
  public readonly '~repr'!: Infer<TElement>[];
  /** Type-token, not available at runtime */
  public readonly '~exotic'!: WgslArray<Exotic<TElement>>;
  public readonly elementCount: number;

  constructor(
    public readonly elementType: TElement,
    public readonly length: number,
  ) {
    if (Number.isNaN(sizeOf(elementType))) {
      throw new Error('Cannot nest runtime sized arrays.');
    }

    this.elementCount = this.length;
  }
}
