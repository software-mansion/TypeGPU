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
import { RecursiveDataTypeError } from '../errors';
import type { ResolutionCtx, TgpuData } from '../types';
import type { I32, U32 } from './numeric';

export function atomic<TSchema extends U32 | I32>(
  data: TSchema,
): Atomic<TSchema> {
  return new AtomicImpl(data);
}

export interface Atomic<TSchema extends U32 | I32>
  extends TgpuData<Unwrap<TSchema>> {}

class AtomicImpl<TSchema extends U32 | I32>
  extends Schema<Unwrap<TSchema>>
  implements Atomic<TSchema>
{
  public readonly size: number;
  public readonly byteAlignment: number;
  isLoose = false as const;
  isCustomAligned: boolean;

  constructor(private readonly innerData: TSchema) {
    super();
    this.size = this.innerData.size;
    this.byteAlignment = this.innerData.byteAlignment;
    this.isCustomAligned = innerData.isCustomAligned;
  }

  resolveReferences(): void {
    throw new RecursiveDataTypeError();
  }

  write(output: ISerialOutput, value: ParseUnwrapped<TSchema>): void {
    this.innerData.write(output, value);
  }

  read(input: ISerialInput): ParseUnwrapped<TSchema> {
    return this.innerData.read(input) as ParseUnwrapped<TSchema>;
  }

  measure(
    value: ParseUnwrapped<TSchema> | MaxValue,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    return this.innerData.measure(value, measurer);
  }

  resolve(ctx: ResolutionCtx): string {
    return `atomic<${ctx.resolve(this.innerData)}>`;
  }
}
