import {
  IMeasurer,
  ISerialInput,
  ISerialOutput,
  MaxValue,
  Measurer,
  ParseUnwrapped,
  Schema,
  Unwrap,
  ValidationError,
} from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
import { IResolutionCtx } from '../types';
import { WGSLCode, code } from '../wgslCode';
import { identifier } from '../wgslIdentifier';
import alignIO from './alignIO';
import { u32 } from './std140';
import type { WGSLDataType } from './types';

class DynamicArrayDataType<TElement extends WGSLDataType<unknown>>
  extends Schema<Unwrap<TElement>[]>
  implements WGSLDataType<Unwrap<TElement>[]>
{
  private readonly _identifier = identifier();
  private readonly _definitionCode: WGSLCode;

  public readonly baseAlignment: number;
  public readonly size: number;

  constructor(
    private readonly _elementType: TElement,
    public readonly capacity: number,
  ) {
    super();

    this.baseAlignment = Math.max(
      4 /* u32 base alignment */,
      this._elementType.baseAlignment,
    );

    this.size = this.measure(MaxValue).size;

    this._definitionCode = code`
    struct ${this._identifier} {
      count: u32,
      values: array<${this._elementType}, ${this.capacity}>,
    }`;
  }

  alias(debugLabel: string) {
    this._identifier.alias(debugLabel);
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

    alignIO(output, this.baseAlignment); // aligning to the start
    u32.write(output, values.length);
    alignIO(output, this._elementType.baseAlignment); // aligning to the start of the array
    const startOffset = output.currentByteOffset;
    for (const value of values) {
      this._elementType.write(output, value);
    }
    output.seekTo(startOffset + this.capacity * this._elementType.size);
  }

  read(input: ISerialInput): ParseUnwrapped<TElement>[] {
    const array: ParseUnwrapped<TElement>[] = [];

    alignIO(input, this.baseAlignment); // aligning to the start
    const len = u32.read(input);
    alignIO(input, this._elementType.baseAlignment); // aligning to the start of the array
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
    alignIO(measurer, this.baseAlignment); // aligning to the start

    // Length encoding
    u32.measure(MaxValue, measurer);

    // Aligning to the start of the array
    alignIO(measurer, this._elementType.baseAlignment);

    // Values encoding
    measurer.add(this._elementType.size * this.capacity);

    return measurer;
  }

  resolve(ctx: IResolutionCtx): string {
    ctx.addDependency(this._definitionCode);

    return ctx.resolve(this._identifier);
  }
}

export default DynamicArrayDataType;
