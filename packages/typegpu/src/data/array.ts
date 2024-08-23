import type * as TB from 'typed-binary';
import {
  type IMeasurer,
  MaxValue,
  Measurer,
  type Parsed,
  Schema,
  type Unwrap,
} from 'typed-binary';
import type { AnyWgslData, ResolutionCtx, WgslData } from '../types';
import alignIO from './alignIO';

export interface WgslArray<TElement extends AnyWgslData>
  extends WgslData<Unwrap<TElement>[]> {
  readonly elementType: TElement;
  readonly elementCount: number;
}

class WgslArrayImpl<TElement extends AnyWgslData>
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
    this.size = elementType.size * count;
  }

  write(output: TB.ISerialOutput, value: Parsed<Unwrap<TElement>>[]) {
    for (let i = 0; i < this.elementCount; i++) {
      if (i >= value.length) {
        output.skipBytes(this.elementType.size);
        continue;
      }
      this.elementType.write(output, value[i]);
    }
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
    return `
      array<${this.elementType.resolve(ctx)}, ${this.elementCount}>;
    `;
  }
}

export const arrayOf = <TElement extends AnyWgslData>(
  elementType: TElement,
  count: number,
): WgslArray<TElement> => new WgslArrayImpl(elementType, count);
