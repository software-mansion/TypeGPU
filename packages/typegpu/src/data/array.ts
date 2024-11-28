import { roundUp } from '../mathUtils';
import type { Infer } from '../shared/repr';
import {
  type AnyWgslData,
  type WgslArray,
  alignmentOfData,
  sizeOfData,
} from './dataTypes';

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
  extends WgslArray<TElement> {}

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
): TgpuArray<TElement> => new TgpuArrayImpl(elementType, length);

// --------------
// Implementation
// --------------

class TgpuArrayImpl<TElement extends AnyWgslData>
  implements TgpuArray<TElement>
{
  public readonly type = 'array';
  /** Type-token, not available at runtime */
  public readonly __repr!: Infer<TElement>[];
  public readonly size: number;
  public readonly alignment: number;
  public readonly stride: number;
  public readonly isLoose = false; // TODO: Remove

  constructor(
    public readonly elementType: TElement,
    public readonly length: number,
  ) {
    this.alignment = alignmentOfData(elementType);
    this.stride = roundUp(sizeOfData(elementType), this.alignment);
    this.size = this.stride * length;
  }
}
