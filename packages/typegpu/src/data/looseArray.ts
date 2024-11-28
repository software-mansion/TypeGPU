import type * as TB from 'typed-binary';
import {
  type IMeasurer,
  type MaxValue,
  Measurer,
  type Parsed,
  Schema,
  type Unwrap,
} from 'typed-binary';
import type { AnyTgpuLooseData } from '../types';
import alignIO from './alignIO';
import { getCustomAlignment } from './attributes';

// ----------
// Public API
// ----------

/**
 * Array schema constructed via `d.looseArrayOf` function.
 *
 * Useful for defining vertex buffers.
 * Elements in the schema are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 */
export interface TgpuLooseArray<TElement extends AnyWgslData | AnyTgpuLooseData>
  extends TgpuLooseData<Unwrap<TElement>[]> {}

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
export const looseArrayOf = <TElement extends AnyWgslData | AnyTgpuLooseData>(
  elementType: TElement,
  count: number,
): TgpuLooseArray<TElement> => new TgpuLooseArrayImpl(elementType, count);

/**
 * Checks whether the passed in value is a looseArray schema,
 * as opposed to, e.g., a regular array schema.
 *
 * Array schemas can be used to describe uniform and storage buffers,
 * whereas looseArray schemas cannot. Loose arrays are useful for
 * defining vertex buffers instead.
 *
 * @example
 * isLooseArraySchema(d.arrayOf(d.u32, 4)) // false
 * isLooseArraySchema(d.looseArrayOf(d.u32, 4)) // true
 * isLooseArraySchema(d.vec3f) // false
 */
export function isLooseArraySchema<T extends TgpuLooseArray<AnyWgslData>>(
  schema: T | unknown,
): schema is T {
  return schema instanceof TgpuLooseArrayImpl;
}

// --------------
// Implementation
// --------------

class TgpuLooseArrayImpl<TElement extends AnyWgslData | AnyTgpuLooseData>
  extends Schema<Unwrap<TElement>[]>
  implements TgpuLooseArray<TElement>
{
  /** Type-token, not available at runtime */
  public readonly __repr!: Unwrap<TElement>[];
  public readonly byteAlignment: number;
  public readonly size: number;
  public readonly stride: number;
  public readonly isLoose = true;

  constructor(
    public readonly elementType: TElement,
    public readonly elementCount: number,
  ) {
    super();
    this.byteAlignment = getCustomAlignment(elementType) ?? 1;
    this.stride = roundUp(elementType.size, this.byteAlignment);
    this.size = this.stride * elementCount;
  }

  write(output: TB.ISerialOutput, value: Parsed<Unwrap<TElement>>[]) {
    alignIO(output, this.byteAlignment);
    const beginning = output.currentByteOffset;
    for (let i = 0; i < Math.min(this.elementCount, value.length); i++) {
      alignIO(output, this.byteAlignment);
      this.elementType.write(output, value[i]);
    }
    output.seekTo(beginning + this.size);
  }

  read(input: TB.ISerialInput): Parsed<Unwrap<TElement>>[] {
    alignIO(input, this.byteAlignment);
    const elements: Parsed<Unwrap<TElement>>[] = [];
    for (let i = 0; i < this.elementCount; i++) {
      alignIO(input, this.byteAlignment);
      elements.push(this.elementType.read(input) as Parsed<Unwrap<TElement>>);
    }
    alignIO(input, this.byteAlignment);
    return elements;
  }

  measure(
    _: MaxValue | Parsed<Unwrap<TElement>>[],
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    alignIO(measurer, this.byteAlignment);
    return measurer.add(this.size);
  }
}
