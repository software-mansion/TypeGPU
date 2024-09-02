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
import type { AnyTgpuData, ResolutionCtx, TgpuData } from '../types';
import alignIO from './alignIO';

export interface TgpuArray<TElement extends AnyTgpuData>
  extends TgpuData<Unwrap<TElement>[]> {
  readonly elementType: TElement;
  readonly elementCount: number;
}

export class TgpuArrayImpl<TElement extends AnyTgpuData>
  extends Schema<Unwrap<TElement>[]>
  implements TgpuArray<TElement>
{
  readonly elementType: TElement;
  readonly elementCount: number;
  readonly byteAlignment: number;
  readonly size: number;
  readonly stride: number;
  constructor(elementType: TElement, count: number) {
    super();
    this.elementType = elementType;
    this.elementCount = count;
    this.byteAlignment = elementType.byteAlignment;
    this.stride = roundUp(
      this.elementType.size,
      this.elementType.byteAlignment,
    );
    this.size = this.stride * this.elementCount;
  }

  write(output: TB.ISerialOutput, value: Parsed<Unwrap<TElement>>[]) {
    alignIO(output, this.byteAlignment);
    const beginning = output.currentByteOffset;
    for (let i = 0; i < Math.min(this.elementCount, value.length); i++) {
      this.elementType.write(output, value[i]);
    }
    output.seekTo(beginning + this.stride * this.elementCount);
  }

  read(input: TB.ISerialInput): Parsed<Unwrap<TElement>>[] {
    alignIO(input, this.byteAlignment);
    const elements: Parsed<Unwrap<TElement>>[] = [];
    for (let i = 0; i < this.elementCount; i++) {
      elements.push(this.elementType.read(input) as Parsed<Unwrap<TElement>>);
    }
    return elements;
  }

  measure(
    value: MaxValue | Parsed<Unwrap<TElement>>[],
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    alignIO(measurer, this.byteAlignment);
    return measurer.add(this.stride * this.elementCount);
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(`
      array<${ctx.resolve(this.elementType)}, ${this.elementCount}>
    `);
  }
}

export const arrayOf = <TElement extends AnyTgpuData>(
  elementType: TElement,
  count: number,
): TgpuArray<TElement> => new TgpuArrayImpl(elementType, count);
