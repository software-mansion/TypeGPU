import type * as TB from 'typed-binary';
import {
  type IMeasurer,
  type MaxValue,
  Measurer,
  type Parsed,
  Schema,
  type Unwrap,
} from 'typed-binary';
import { roundUp } from '../mathUtils';
import type {
  AnyTgpuData,
  AnyTgpuLooseData,
  ResolutionCtx,
  TgpuData,
  TgpuLooseData,
} from '../types';
import alignIO from './alignIO';
import { getCustomAlignment } from './attributes';

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
export interface TgpuArray<TElement extends AnyTgpuData>
  extends TgpuData<Unwrap<TElement>[]> {
  readonly elementType: TElement;
  readonly elementCount: number;
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
 * @param count The number of elements in the array.
 */
export const arrayOf = <TElement extends AnyTgpuData>(
  elementType: TElement,
  count: number,
): TgpuArray<TElement> => new TgpuArrayImpl(elementType, count);

/**
 * Array schema constructed via `d.looseArrayOf` function.
 *
 * Useful for defining tgpu vertex buffers.
 * Elements in the schema are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 */
export interface TgpuLooseArray<TElement extends AnyTgpuData | AnyTgpuLooseData>
  extends TgpuLooseData<Unwrap<TElement>[]> {
  readonly elementType: TElement;
  readonly elementCount: number;
}

/**
 * Creates an array schema that can be used to construct tgpu vertex buffers.
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
export const looseArrayOf = <TElement extends AnyTgpuData | AnyTgpuLooseData>(
  elementType: TElement,
  count: number,
): TgpuLooseArray<TElement> => new TgpuLooseArrayImpl(elementType, count);

/**
 * Checks whether passed in value is an array schema,
 * as opposed to, e.g., a looseArray schema.
 *
 * Array schemas can be used to describe uniform and storage buffers,
 * whereas looseArray schemas cannot.
 *
 * @example
 * isArraySchema(d.arrayOf(d.u32, 4)) // true
 * isArraySchema(d.looseArrayOf(d.u32, 4)) // false
 * isArraySchema(d.vec3f) // false
 */
export function isArraySchema<T extends TgpuArray<AnyTgpuData>>(
  schema: T | unknown,
): schema is T {
  return schema instanceof TgpuArrayImpl;
}

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
export function isLooseArraySchema<T extends TgpuLooseArray<AnyTgpuData>>(
  schema: T | unknown,
): schema is T {
  return schema instanceof TgpuLooseArrayImpl;
}

// --------------
// Implementation
// --------------

class TgpuArrayImpl<TElement extends AnyTgpuData>
  extends Schema<Unwrap<TElement>[]>
  implements TgpuArray<TElement>
{
  public readonly byteAlignment: number;
  public readonly size: number;
  public readonly stride: number;
  public readonly isLoose = false;

  constructor(
    public readonly elementType: TElement,
    public readonly elementCount: number,
  ) {
    super();
    this.byteAlignment = elementType.byteAlignment;
    this.stride = roundUp(elementType.size, elementType.byteAlignment);
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

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(`
      array<${ctx.resolve(this.elementType)}, ${this.elementCount}>
    `);
  }
}

class TgpuLooseArrayImpl<TElement extends AnyTgpuData | AnyTgpuLooseData>
  extends Schema<Unwrap<TElement>[]>
  implements TgpuLooseArray<TElement>
{
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
