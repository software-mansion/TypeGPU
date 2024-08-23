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
import type { AnyWgslData, ResolutionCtx, WgslData } from '../types';
import alignIO from './alignIO';

export function align<TSchema extends AnySchema>(
  byteAlignment: number,
  data: WgslData<Unwrap<TSchema>>,
) {
  return new WgslAlignDataImpl(data, byteAlignment);
}

export interface WgslAlignData<TSchema> extends WgslData<Unwrap<TSchema>> {}

export class WgslAlignDataImpl<TSchema extends AnySchema>
  extends Schema<Unwrap<TSchema>>
  implements WgslAlignData<TSchema>
{
  public readonly size: number;

  constructor(
    private data: AnyWgslData,
    public readonly byteAlignment: number,
  ) {
    super();

    this.size = this.measure(MaxValue).size;
  }

  write(output: ISerialOutput, value: ParseUnwrapped<TSchema>): void {
    this.data.write(output, value);
  }

  read(input: ISerialInput): ParseUnwrapped<TSchema> {
    return this.data.read(input) as ParseUnwrapped<TSchema>;
  }

  measure(
    value: MaxValue | ParseUnwrapped<TSchema>,
    measurer?: IMeasurer | undefined,
  ): IMeasurer {
    alignIO(measurer ?? new Measurer(), this.byteAlignment);
    return this.data.measure(value, measurer);
  }

  resolve(ctx: ResolutionCtx): string {
    return this.data.resolve(ctx);
  }
}
