import type * as TB from 'typed-binary';
import {
  type IMeasurer,
  MaxValue,
  Measurer,
  type Parsed,
  Schema,
  type Unwrap,
} from 'typed-binary';
import { roundUp } from '../mathUtils';
import type { AnyWgslData, ResolutionCtx, WgslData } from '../types';
import alignIO from './alignIO';

export interface WgslArray<TElement extends AnyWgslData>
  extends WgslData<Unwrap<TElement>[]> {
  readonly elementType: TElement;
  readonly elementCount: number;
}

export class WgslArrayImpl<TElement extends AnyWgslData>
  extends Schema<Unwrap<TElement>[]>
  implements WgslArray<TElement>
{
  readonly elementType: TElement;
  readonly elementCount: number;
  readonly byteAlignment: number;
  readonly size: number;
  constructor(elementType: TElement, count: number) {
    super();
    this.elementType = elementType;
    this.elementCount = count;
    this.byteAlignment = elementType.byteAlignment;
    this.size = this.measure(MaxValue).size;
  }

  write(output: TB.ISerialOutput, value: Parsed<Unwrap<TElement>>[]) {
    alignIO(output, this.byteAlignment);
    const beginning = output.currentByteOffset;
    for (let i = 0; i < Math.min(this.elementCount, value.length); i++) {
      this.elementType.write(output, value[i]);
    }
    output.seekTo(
      beginning +
        roundUp(this.elementType.size, this.byteAlignment) * this.elementCount,
    );
  }

  read(input: TB.ISerialInput): Parsed<Unwrap<TElement>>[] {
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
    for (let i = 0; i < this.elementCount; i++) {
      this.elementType.measure(
        value === MaxValue ? MaxValue : value[i],
        measurer,
      );
    }

    return measurer;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(`
      array<${ctx.resolve(this.elementType)}, ${this.elementCount}>
    `);
  }
}

export const arrayOf = <TElement extends AnyWgslData>(
  elementType: TElement,
  count: number,
): WgslArray<TElement> => new WgslArrayImpl(elementType, count);
