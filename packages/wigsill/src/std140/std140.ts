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
import type { ResolutionCtx, Wgsl } from '../types';
import alignIO from './alignIO';
import type { WGSLDataType } from './types';

export class SimpleWGSLDataType<TSchema extends AnySchema>
  extends Schema<Unwrap<TSchema>>
  implements WGSLDataType<Unwrap<TSchema>>
{
  public readonly size: number;
  public readonly byteAlignment: number;

  private readonly _innerSchema: TSchema;
  private readonly _expressionCode: Wgsl;

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
    this._expressionCode = code;
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

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(this._expressionCode);
  }
}
