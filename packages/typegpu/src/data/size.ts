import {
  type IMeasurer,
  type ISerialInput,
  type ISerialOutput,
  type MaxValue,
  Measurer,
  type ParseUnwrapped,
  Schema,
  type Unwrap,
} from 'typed-binary';
import type { AnyWgslData, ResolutionCtx, WgslData } from '../types';

export function size<TSize extends number, TData extends AnyWgslData>(
  size: TSize,
  data: TData,
): WgslDataCustomSized<TSize, TData> {
  return new WgslDataCustomSizedImpl(data, size);
}

export interface WgslDataCustomSized<
  TSize extends number,
  TData extends AnyWgslData,
> extends WgslData<Unwrap<TData>> {}

export class WgslDataCustomSizedImpl<
    TSize extends number,
    TData extends AnyWgslData,
  >
  extends Schema<Unwrap<TData>>
  implements WgslDataCustomSized<TSize, TData>
{
  public readonly byteAlignment: number;

  constructor(
    private data: AnyWgslData,
    public readonly size: number,
  ) {
    super();

    this.byteAlignment = this.data.byteAlignment;

    if (size < this.data.size) {
      throw new Error(
        `Custom data size cannot be smaller then the standard data size. Got: ${size}, expected at least: ${this.data.size}.`,
      );
    }

    if (size <= 0) {
      throw new Error(
        `Custom data size must be a positive number. Got: ${size}.`,
      );
    }
  }

  write(output: ISerialOutput, value: ParseUnwrapped<TData>): void {
    this.data.write(output, value);
  }

  read(input: ISerialInput): ParseUnwrapped<TData> {
    return this.data.read(input) as ParseUnwrapped<TData>;
  }

  measure(
    value: MaxValue | ParseUnwrapped<TData>,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    measurer.add(this.size - this.data.size);
    return this.data.measure(value, measurer);
  }

  resolve(ctx: ResolutionCtx): string {
    return this.data.resolve(ctx);
  }
}
