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

  private readonly _innerSchema: TSchema;
  public readonly isLoose = false as const;
  public readonly label: string;

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
    this.size = this.measure(MaxValue).size;
    this.label = code;
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

  resolve(ctx: ResolutionCtx): string {
    return this.label;
  }
}
