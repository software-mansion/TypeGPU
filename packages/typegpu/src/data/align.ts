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
import type { AnyTgpuData, ResolutionCtx, TgpuData } from '../types';
import alignIO from './alignIO';

export function align<TAlign extends number, TData extends AnyTgpuData>(
  byteAlignment: TAlign,
  data: TData,
): TgpuAligned<TAlign, TData> {
  return new TgpuAlignedImpl(data, byteAlignment);
}

export interface TgpuAligned<TAlign extends number, TData extends AnyTgpuData>
  extends TgpuData<Unwrap<TData>> {}

export class TgpuAlignedImpl<TAlign extends number, TData extends AnyTgpuData>
  extends Schema<Unwrap<TData>>
  implements TgpuAligned<TAlign, TData>
{
  public readonly size: number;
  isLoose = false as const;
  isCustomAligned = true;

  constructor(
    private data: AnyTgpuData,
    public readonly byteAlignment: number,
  ) {
    super();

    this.size = this.data.size;

    if (byteAlignment <= 0) {
      throw new Error(
        `Custom data alignment must be a positive number, got: ${byteAlignment}.`,
      );
    }

    if (Math.log2(byteAlignment) % 1 !== 0) {
      throw new Error(
        `Alignment has to be a power of 2, got: ${byteAlignment}.`,
      );
    }

    if (byteAlignment % this.data.byteAlignment !== 0) {
      throw new Error(
        `Custom alignment has to be a multiple of the standard data byteAlignment. Got: ${byteAlignment}, expected multiple of: ${this.data.byteAlignment}.`,
      );
    }
  }

  write(output: ISerialOutput, value: ParseUnwrapped<TData>): void {
    alignIO(output, this.byteAlignment);
    this.data.write(output, value);
  }

  read(input: ISerialInput): ParseUnwrapped<TData> {
    alignIO(input, this.byteAlignment);
    return this.data.read(input) as ParseUnwrapped<TData>;
  }

  measure(
    value: MaxValue | ParseUnwrapped<TData>,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    alignIO(measurer, this.byteAlignment);
    return this.data.measure(value, measurer);
  }

  resolve(ctx: ResolutionCtx): string {
    return this.data.resolve(ctx);
  }
}
