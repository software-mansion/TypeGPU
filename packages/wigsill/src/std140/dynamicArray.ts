import {
  type IMeasurer,
  type ISerialInput,
  type ISerialOutput,
  MaxValue,
  Measurer,
  type ParseUnwrapped,
  Schema,
  type Unwrap,
  ValidationError,
} from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
import type { ResolutionCtx } from '../types';
import { type WGSLCode, code } from '../wgslCode';
import { identifier } from '../wgslIdentifier';
import alignIO from './alignIO';
import { u32 } from './numeric';
import type { AnyWGSLDataType, WGSLDataType } from './types';

class DynamicArrayDataType<TElement extends WGSLDataType<unknown>>
  extends Schema<Unwrap<TElement>[]>
  implements WGSLDataType<Unwrap<TElement>[]>
{
  private readonly _identifier = identifier();
  private readonly _definitionCode: WGSLCode;

  public readonly byteAlignment: number;
  public readonly size: number;

  constructor(
    private readonly _elementType: TElement,
    public readonly capacity: number,
  ) {
    super();

    this.byteAlignment = Math.max(
      4 /* u32 base alignment */,
      this._elementType.byteAlignment,
    );

    this.size = this.measure(MaxValue).size;

    this._definitionCode = code`
    struct ${this._identifier} {
      count: u32,
      values: array<${this._elementType}, ${this.capacity}>,
    }`;
  }

  $name(debugLabel: string) {
    this._identifier.$name(debugLabel);
    return this;
  }

  resolveReferences(): void {
    throw new RecursiveDataTypeError();
  }

  write(output: ISerialOutput, values: ParseUnwrapped<TElement>[]): void {
    if (values.length > this.capacity) {
      throw new ValidationError(
        `Tried to write too many values, ${values.length} > ${this.capacity}`,
      );
    }

    alignIO(output, this.byteAlignment); // aligning to the start
    u32.write(output, values.length);
    alignIO(output, this._elementType.byteAlignment); // aligning to the start of the array
    const startOffset = output.currentByteOffset;
    for (const value of values) {
      this._elementType.write(output, value);
    }
    output.seekTo(startOffset + this.capacity * this._elementType.size);
  }

  read(input: ISerialInput): ParseUnwrapped<TElement>[] {
    const array: ParseUnwrapped<TElement>[] = [];

    alignIO(input, this.byteAlignment); // aligning to the start
    const len = u32.read(input);
    alignIO(input, this._elementType.byteAlignment); // aligning to the start of the array
    const startOffset = input.currentByteOffset;
    for (let i = 0; i < len; ++i) {
      array.push(this._elementType.read(input) as ParseUnwrapped<TElement>);
    }
    input.seekTo(startOffset + this.capacity * this._elementType.size);

    return array;
  }

  measure(
    _values: ParseUnwrapped<TElement>[] | typeof MaxValue,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    alignIO(measurer, this.byteAlignment); // aligning to the start

    // Length encoding
    u32.measure(MaxValue, measurer);

    // Aligning to the start of the array
    alignIO(measurer, this._elementType.byteAlignment);

    // Values encoding
    measurer.add(this._elementType.size * this.capacity);

    return measurer;
  }

  resolve(ctx: ResolutionCtx): string {
    ctx.addDependency(this._definitionCode);

    return ctx.resolve(this._identifier);
  }
}

export const dynamicArrayOf = <TSchema extends AnyWGSLDataType>(
  elementType: TSchema,
  capacity: number,
) => new DynamicArrayDataType(elementType, capacity);

export default DynamicArrayDataType;
