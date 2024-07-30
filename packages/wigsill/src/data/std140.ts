/*
 * Typed-binary types that adhere to the `std140` layout rules.
 */

import {
  type AnySchema,
  type IMeasurer,
  type ISerialInput,
  type ISerialOutput,
  MaxValue,
  Measurer,
  type ParseUnwrapped,
  Schema,
  type Unwrap,
} from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
import type { ResolutionCtx, Wgsl, WgslData } from '../types';
import alignIO from './alignIO';

export class SimpleWgslData<TSchema extends AnySchema>
  extends Schema<Unwrap<TSchema>>
  implements WgslData<Unwrap<TSchema>>
{
  public readonly size: number;
  public readonly byteAlignment: number;
  public readonly expressionCode: Wgsl;

  private readonly _innerSchema: TSchema;

  /**
   * byteAlignment has to be a power of 2
   */
  constructor({
    schema,
    byteAlignment,
    code,
  }: {
    schema: TSchema;
    byteAlignment: number;
    code: Wgsl;
  }) {
    super();

    this._innerSchema = schema;
    this.byteAlignment = byteAlignment;
    this.expressionCode = code;
    this.size = this.measure(MaxValue).size;
  }

  resolveReferences(): void {
    throw new RecursiveDataTypeError();
  }

  write(output: ISerialOutput, value: ParseUnwrapped<TSchema>): void {
    alignIO(output, this.byteAlignment);
    this._innerSchema.write(output, value);
  }

  read(input: ISerialInput): ParseUnwrapped<TSchema> {
    alignIO(input, this.byteAlignment);
    return this._innerSchema.read(input) as ParseUnwrapped<TSchema>;
  }

  measure(
    value: ParseUnwrapped<TSchema> | MaxValue,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    alignIO(measurer, this.byteAlignment);

    this._innerSchema.measure(value, measurer);

    return measurer;
  }

  getUnderlyingTypeString(): string {
    if (typeof this.expressionCode === 'string') {
      return this.expressionCode;
    }
    if ('elementSchema' in this._innerSchema) {
      const underlyingType = this._innerSchema
        .elementSchema as SimpleWgslData<AnySchema>;
      return underlyingType.getUnderlyingTypeString();
    }
    throw new Error('Unexpected type used as vertex buffer element');
  }

  getUnderlyingType(): SimpleWgslData<AnySchema> {
    if ('elementSchema' in this._innerSchema) {
      const underlyingType = this._innerSchema
        .elementSchema as SimpleWgslData<AnySchema>;
      return underlyingType.getUnderlyingType();
    }
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(this.expressionCode);
  }
}
