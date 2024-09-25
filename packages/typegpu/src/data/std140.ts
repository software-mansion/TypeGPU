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
import type { ResolutionCtx, TgpuData } from '../types';

export class SimpleTgpuData<TSchema extends AnySchema>
  extends Schema<Unwrap<TSchema>>
  implements TgpuData<Unwrap<TSchema>>
{
  public readonly size: number;
  public readonly byteAlignment: number;
  public readonly expressionCode: string;
  public readonly isCustomAligned = false;

  private readonly _innerSchema: TSchema;
  public readonly isLoose = false as const;
  public readonly label?: string | undefined;

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
    code: string;
  }) {
    super();

    this._innerSchema = schema;
    this.byteAlignment = byteAlignment;
    this.expressionCode = code;
    this.size = this.measure(MaxValue).size;
    this.label = `data: ${code}`;
  }

  resolveReferences(): void {
    throw new RecursiveDataTypeError();
  }

  write(output: ISerialOutput, value: ParseUnwrapped<TSchema>): void {
    this._innerSchema.write(output, value);
  }

  read(input: ISerialInput): ParseUnwrapped<TSchema> {
    return this._innerSchema.read(input) as ParseUnwrapped<TSchema>;
  }

  measure(
    value: ParseUnwrapped<TSchema> | MaxValue,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    this._innerSchema.measure(value, measurer);

    return measurer;
  }

  getUnderlyingTypeString(): string {
    if (typeof this.expressionCode === 'string') {
      return this.expressionCode;
    }
    if ('elementSchema' in this._innerSchema) {
      const underlyingType = this._innerSchema
        .elementSchema as SimpleTgpuData<AnySchema>;
      return underlyingType.getUnderlyingTypeString();
    }
    throw new Error('Unexpected type used as vertex buffer element');
  }

  getUnderlyingType(): SimpleTgpuData<AnySchema> {
    if ('elementSchema' in this._innerSchema) {
      const underlyingType = this._innerSchema
        .elementSchema as SimpleTgpuData<AnySchema>;
      return underlyingType.getUnderlyingType();
    }
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    return this.expressionCode;
  }
}
