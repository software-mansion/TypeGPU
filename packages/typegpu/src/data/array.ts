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

export interface TgpuArray<TElement extends AnyTgpuData>
  extends TgpuData<Unwrap<TElement>[]> {
  readonly elementType: TElement;
  readonly elementCount: number;
}

export const arrayOf = <TElement extends AnyTgpuData>(
  elementType: TElement,
  count: number,
): TgpuArray<TElement> => new TgpuArrayImpl(elementType, count);

export interface TgpuLooseArray<TElement extends AnyTgpuData | AnyTgpuLooseData>
  extends TgpuLooseData<Unwrap<TElement>[]> {
  readonly elementType: TElement;
  readonly elementCount: number;
}

export const looseArrayOf = <TElement extends AnyTgpuData | AnyTgpuLooseData>(
  elementType: TElement,
  count: number,
): TgpuLooseArray<TElement> => new TgpuLooseArrayImpl(elementType, count);

export function isArraySchema<T extends TgpuArray<AnyTgpuData>>(
  schema: T | unknown,
): schema is T {
  return schema instanceof TgpuArrayImpl;
}

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
