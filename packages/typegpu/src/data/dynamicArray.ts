import {
  type IMeasurer,
  type ISchema,
  type ISerialInput,
  type ISerialOutput,
  MaxValue,
  Measurer,
  type ParseUnwrapped,
  type Parsed,
  type Unwrap,
  ValidationError,
} from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
import type {
  AnyWgslData,
  ResolutionCtx,
  WgslData,
  WgslNamable,
} from '../types';
import { code } from '../wgslCode';
import { WgslIdentifier } from '../wgslIdentifier';
import alignIO from './alignIO';
import { u32 } from './numeric';

class DynamicArrayDataType<TElement extends WgslData<unknown>>
  implements WgslData<Unwrap<TElement>[]>, WgslNamable
{
  __unwrapped!: Unwrap<TElement>[]; // type-token, not available at runtime

  private _label: string | undefined;

  public readonly byteAlignment: number;
  public readonly size: number;

  constructor(
    private readonly _elementType: TElement,
    public readonly capacity: number,
  ) {
    this.byteAlignment = Math.max(
      4 /* u32 base alignment */,
      this._elementType.byteAlignment,
    );

    this.size = this.measure(MaxValue).size;
  }

  $name(label: string): this {
    this._label = label;
    return this;
  }

  seekProperty(
    reference:
      | Parsed<Unwrap<TElement>, Record<string, never>>[]
      | typeof MaxValue,
    prop: keyof Unwrap<TElement>[],
  ): { bufferOffset: number; schema: ISchema<unknown> } | null {
    throw new Error('Cannot seek property of dynamic array.');
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
    const identifier = new WgslIdentifier().$name(this._label);

    ctx.addDeclaration(code`
      struct ${identifier} {
        count: u32,
        values: array<${this._elementType}, ${this.capacity}>,
      }`);

    return ctx.resolve(identifier);
  }
}

export const dynamicArrayOf = <TSchema extends AnyWgslData>(
  elementType: TSchema,
  capacity: number,
) => new DynamicArrayDataType(elementType, capacity);

export default DynamicArrayDataType;
