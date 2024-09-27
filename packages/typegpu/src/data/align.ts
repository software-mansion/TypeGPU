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
import {
  type AnyTgpuData,
  type AnyTgpuLooseData,
  type ResolutionCtx,
  type TgpuData,
  type TgpuLooseData,
  isDataLoose,
  isDataNotLoose,
} from '../types';
import alignIO from './alignIO';

export function align<TAlign extends number, TData extends AnyTgpuData>(
  byteAlignment: TAlign,
  data: TData,
): TgpuAligned<TAlign, TData>;

export function align<TAlign extends number, TData extends AnyTgpuLooseData>(
  byteAlignment: TAlign,
  data: TData,
): TgpuLooseAligned<TAlign, TData>;

export function align<
  TAlign extends number,
  TData extends AnyTgpuData | AnyTgpuLooseData,
>(byteAlignment: TAlign, data: TData) {
  if (isDataLoose(data)) {
    return new TgpuLooseAlignedImpl(data, byteAlignment) as TgpuLooseAligned<
      TAlign,
      typeof data
    >;
  }

  if (isDataNotLoose(data)) {
    return new TgpuAlignedImpl(data, byteAlignment) as TgpuAligned<
      TAlign,
      typeof data
    >;
  }
}

export interface TgpuAligned<TAlign extends number, TData extends AnyTgpuData>
  extends TgpuData<Unwrap<TData>> {}

export interface TgpuLooseAligned<
  TAlign extends number,
  TData extends AnyTgpuLooseData,
> extends TgpuLooseData<Unwrap<TData>> {}

class AbstractTgpuAlignedImpl<
  TAlign extends number,
  TData extends AnyTgpuData | AnyTgpuLooseData,
> extends Schema<Unwrap<TData>> {
  public readonly size: number;
  public readonly isCustomAligned = true;

  constructor(
    protected data: AnyTgpuData | AnyTgpuLooseData,
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

    if (isDataNotLoose(this.data)) {
      if (byteAlignment % this.data.byteAlignment !== 0) {
        throw new Error(
          `Custom alignment has to be a multiple of the standard data byteAlignment. Got: ${byteAlignment}, expected multiple of: ${this.data.byteAlignment}.`,
        );
      }
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
}

export class TgpuAlignedImpl<TAlign extends number, TData extends AnyTgpuData>
  extends AbstractTgpuAlignedImpl<TAlign, TData>
  implements TgpuAligned<TAlign, TData>
{
  public readonly isLoose = false as const;

  resolve(ctx: ResolutionCtx): string {
    if (isDataLoose(this.data)) {
      throw new Error('Cannot resolve loose data in a non-loose aligned data.');
    }
    return this.data.resolve(ctx);
  }
}

export class TgpuLooseAlignedImpl<
    TAlign extends number,
    TData extends AnyTgpuLooseData,
  >
  extends AbstractTgpuAlignedImpl<TAlign, TData>
  implements TgpuLooseAligned<TAlign, TData>
{
  public readonly isLoose = true as const;
}
