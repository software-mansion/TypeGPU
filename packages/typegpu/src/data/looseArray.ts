import type * as TB from 'typed-binary';
import {
  type IMeasurer,
  type MaxValue,
  Measurer,
  type Parsed,
  type Unwrap,
} from 'typed-binary';
import { roundUp } from '../mathUtils';
import type { Infer } from '../shared/repr';
import alignIO from './alignIO';
import { getCustomAlignment } from './attributes';
import { dataReaders, dataWriters } from './dataIO';
import type { AnyData, LooseArray } from './dataTypes';
import { sizeOfData } from './wgslTypes';

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
  public readonly alignment: number;
  public readonly size: number;
  public readonly stride: number;

  constructor(
    public readonly elementType: TElement,
    public readonly length: number,
  ) {
    this.alignment = getCustomAlignment(elementType) ?? 1;
    this.stride = roundUp(sizeOfData(elementType), this.alignment);
    this.size = this.stride * length;
  }

  write(output: TB.ISerialOutput, value: Parsed<Unwrap<TElement>>[]) {
    alignIO(output, this.alignment);
    const beginning = output.currentByteOffset;
    for (let i = 0; i < Math.min(this.length, value.length); i++) {
      alignIO(output, this.alignment);
      dataWriters[(this.elementType as AnyData)?.type]?.(
        output,
        this.elementType,
        value[i],
      );
    }
    output.seekTo(beginning + this.size);
  }

  read(input: TB.ISerialInput): Parsed<Unwrap<TElement>>[] {
    alignIO(input, this.alignment);
    const elements: Parsed<Unwrap<TElement>>[] = [];
    for (let i = 0; i < this.length; i++) {
      alignIO(input, this.alignment);
      const reader = dataReaders[(this.elementType as AnyData)?.type];
      elements.push(
        reader?.(input, this.elementType) as Parsed<Unwrap<TElement>>,
      );
    }
    alignIO(input, this.alignment);
    return elements;
  }

  measure(
    _: MaxValue | Parsed<Unwrap<TElement>>[],
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    alignIO(measurer, this.alignment);
    return measurer.add(this.size);
  }
}
