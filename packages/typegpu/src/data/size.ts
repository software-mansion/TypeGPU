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

// ----------
// Public API
// ----------

export function size<TSize extends number, TData extends AnyTgpuData>(
  size: TSize,
  data: TData,
): TgpuSized<TSize, TData> {
  return new TgpuSizedImpl(data, size);
}

export interface TgpuSized<TSize extends number, TData extends AnyTgpuData>
  extends TgpuData<Unwrap<TData>> {
  readonly size: TSize;
}

export function isSizedSchema<T extends TgpuSized<number, TgpuData<unknown>>>(
  value: T | unknown,
): value is T {
  return value instanceof TgpuSizedImpl;
}

// --------------
// Implementation
// --------------

class TgpuSizedImpl<TSize extends number, TData extends AnyTgpuData>
  extends Schema<Unwrap<TData>>
  implements TgpuSized<TSize, TData>
{
  public readonly byteAlignment: number;
  public readonly isLoose = false as const;
  public readonly isCustomAligned: boolean;

  constructor(
    private data: AnyTgpuData,
    public readonly size: TSize,
  ) {
    super();

    this.byteAlignment = this.data.byteAlignment;
    this.isCustomAligned = this.data.isCustomAligned;

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
    if (this.isCustomAligned) {
      alignIO(output, this.byteAlignment);
    }
    this.data.write(output, value);
  }

  read(input: ISerialInput): ParseUnwrapped<TData> {
    if (this.isCustomAligned) {
      alignIO(input, this.byteAlignment);
    }
    return this.data.read(input) as ParseUnwrapped<TData>;
  }

  measure(
    value: MaxValue | ParseUnwrapped<TData>,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    if (this.isCustomAligned) {
      alignIO(measurer, this.byteAlignment);
    }
    return measurer.add(this.size);
  }

  resolve(ctx: ResolutionCtx): string {
    return this.data.resolve(ctx);
  }
}
