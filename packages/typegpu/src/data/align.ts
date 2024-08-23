import {
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

export function align<TAlign extends number, TData extends AnyWgslData>(
  byteAlignment: TAlign,
  data: TData,
): WgslAlignData<TAlign, TData> {
  return new WgslAlignDataImpl(data, byteAlignment);
}

export interface WgslAlignData<TAlign extends number, TData extends AnyWgslData>
  extends WgslData<Unwrap<TData>> {}

export class WgslAlignDataImpl<TAlign extends number, TData extends AnyWgslData>
  extends Schema<Unwrap<TData>>
  implements WgslAlignData<TAlign, TData>
{
  public readonly size: number;

  constructor(
    private data: AnyWgslData,
    public readonly byteAlignment: number,
  ) {
    super();

    this.size = this.measure(MaxValue).size;
  }

  write(output: ISerialOutput, value: ParseUnwrapped<TData>): void {
    this.data.write(output, value);
  }

  read(input: ISerialInput): ParseUnwrapped<TData> {
    return this.data.read(input) as ParseUnwrapped<TData>;
  }

  measure(
    value: MaxValue | ParseUnwrapped<TData>,
    measurer?: IMeasurer | undefined,
  ): IMeasurer {
    alignIO(measurer ?? new Measurer(), this.byteAlignment);
    return this.data.measure(value, measurer);
  }

  resolve(ctx: ResolutionCtx): string {
    return this.data.resolve(ctx);
  }
}
