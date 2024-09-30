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

// ----------
// Public API
// ----------

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
>(
  byteAlignment: TAlign,
  data: TData,
):
  | TgpuAligned<TAlign, Extract<TData, AnyTgpuData>>
  | TgpuLooseAligned<TAlign, Extract<TData, AnyTgpuLooseData>> {
  if (isDataLoose(data)) {
    return new TgpuLooseAlignedImpl<TAlign, Extract<TData, AnyTgpuLooseData>>(
      data,
      byteAlignment,
    );
  }

  if (isDataNotLoose(data)) {
    return new TgpuAlignedImpl<TAlign, Extract<TData, AnyTgpuData>>(
      data,
      byteAlignment,
    );
  }

  throw new Error(`Could not align data: ${data}`);
}

export interface TgpuAligned<TAlign extends number, TData extends AnyTgpuData>
  extends TgpuData<Unwrap<TData>> {
  readonly byteAlignment: TAlign;
}

export interface TgpuLooseAligned<
  TAlign extends number,
  TData extends AnyTgpuLooseData,
> extends TgpuLooseData<Unwrap<TData>> {
  readonly byteAlignment: TAlign;
}

export function isLooseAlignedSchema<
  T extends TgpuLooseAligned<number, AnyTgpuLooseData>,
>(value: T | unknown): value is T {
  return value instanceof TgpuLooseAlignedImpl;
}

export function isAlignedSchema<T extends TgpuAligned<number, AnyTgpuData>>(
  value: T | unknown,
): value is T {
  return value instanceof TgpuAlignedImpl;
}

// --------------
// Implementation
// --------------

class AbstractTgpuAlignedImpl<
  TAlign extends number,
  TData extends AnyTgpuData | AnyTgpuLooseData,
> extends Schema<Unwrap<TData>> {
  public readonly size: number;
  public readonly isCustomAligned = true;

  constructor(
    private data: AnyTgpuData | AnyTgpuLooseData,
    public readonly byteAlignment: TAlign,
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

  resolve(ctx: ResolutionCtx): string {
    return this.data.resolve(ctx);
  }
}

class TgpuAlignedImpl<TAlign extends number, TData extends AnyTgpuData>
  extends AbstractTgpuAlignedImpl<TAlign, TData>
  implements TgpuAligned<TAlign, TData>
{
  public readonly isLoose = false as const;
}

class TgpuLooseAlignedImpl<
    TAlign extends number,
    TData extends AnyTgpuLooseData,
  >
  extends AbstractTgpuAlignedImpl<TAlign, TData>
  implements TgpuLooseAligned<TAlign, TData>
{
  public readonly isLoose = true as const;
}
