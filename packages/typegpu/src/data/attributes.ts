import {
  type IMeasurer,
  type IRefResolver,
  type ISchema,
  type ISerialInput,
  type ISerialOutput,
  MaxValue,
  Measurer,
  type Parsed,
  type Unwrap,
} from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
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

export interface Align<T extends number> {
  align: T;
}

export interface Size<T extends number> {
  size: T;
}

export type AnyAttribute = Align<number> | Size<number>;

export type AnyAttributeTuple = [...AnyAttribute[]];

export interface Decorated<
  TInner extends AnyTgpuData,
  TAttribs extends AnyAttributeTuple,
> extends TgpuData<Unwrap<TInner>> {
  readonly inner: TInner;
  readonly attributes: TAttribs;

  // Easy access to all attributes, if they exist
  readonly customAlignment: number | undefined;
  readonly customSize: number | undefined;
}

export interface LooseDecorated<
  TInner extends AnyTgpuLooseData,
  TAttribs extends AnyAttributeTuple,
> extends TgpuLooseData<Unwrap<TInner>> {
  readonly inner: TInner;
  readonly attributes: TAttribs;

  // Easy access to all attributes, if they exist
  readonly customAlignment: number | undefined;
  readonly customSize: number | undefined;
}

export type ExtractAttributes<T> = T extends Decorated<
  AnyTgpuData,
  infer Attribs
>
  ? Attribs
  : T extends LooseDecorated<AnyTgpuLooseData, infer Attribs>
    ? Attribs
    : [];

export type UnwrapDecorated<T> = T extends Decorated<
  infer Inner,
  AnyAttributeTuple
>
  ? Inner
  : T extends LooseDecorated<infer Inner, AnyAttributeTuple>
    ? Inner
    : T;

export function attribute<
  TData extends AnyTgpuData | AnyTgpuLooseData,
  TAttrib extends AnyAttribute,
>(
  data: TData,
  attrib: TAttrib,
):
  | Decorated<
      UnwrapDecorated<TData> & AnyTgpuData,
      [TAttrib, ...ExtractAttributes<TData>]
    >
  | LooseDecorated<
      UnwrapDecorated<TData> & AnyTgpuLooseData,
      [TAttrib, ...ExtractAttributes<TData>]
    > {
  type Return =
    | Decorated<
        UnwrapDecorated<TData> & AnyTgpuData,
        [TAttrib, ...ExtractAttributes<TData>]
      >
    | LooseDecorated<
        UnwrapDecorated<TData> & AnyTgpuLooseData,
        [TAttrib, ...ExtractAttributes<TData>]
      >;

  if (isDecorated(data)) {
    return new DecoratedImpl(data.inner, [
      attrib,
      ...data.attributes,
    ]) as unknown as Return;
  }

  if (isLooseDecorated(data)) {
    return new LooseDecoratedImpl(data.inner, [
      attrib,
      ...data.attributes,
    ]) as unknown as Return;
  }

  if (isDataLoose(data)) {
    return new LooseDecoratedImpl(data, [attrib]) as unknown as Return;
  }

  return new DecoratedImpl(data, [attrib]) as unknown as Return;
}

export function align<TAlign extends number, TData extends AnyTgpuData>(
  align: TAlign,
  data: TData,
): Decorated<
  UnwrapDecorated<TData>,
  [Align<TAlign>, ...ExtractAttributes<TData>]
>;
export function align<TAlign extends number, TData extends AnyTgpuLooseData>(
  align: TAlign,
  data: TData,
): LooseDecorated<
  UnwrapDecorated<TData>,
  [Align<TAlign>, ...ExtractAttributes<TData>]
>;
export function align<
  TAlign extends number,
  TData extends AnyTgpuData | AnyTgpuLooseData,
>(
  align: TAlign,
  data: TData,
):
  | Decorated<
      UnwrapDecorated<TData> & AnyTgpuData,
      [Align<TAlign>, ...ExtractAttributes<TData>]
    >
  | LooseDecorated<
      UnwrapDecorated<TData> & AnyTgpuLooseData,
      [Align<TAlign>, ...ExtractAttributes<TData>]
    > {
  return attribute(data, { align });
}

export function size<TSize extends number, TData extends AnyTgpuData>(
  size: TSize,
  data: TData,
): Decorated<
  UnwrapDecorated<TData>,
  [Size<TSize>, ...ExtractAttributes<TData>]
>;
export function size<TSize extends number, TData extends AnyTgpuLooseData>(
  size: TSize,
  data: TData,
): LooseDecorated<
  UnwrapDecorated<TData>,
  [Size<TSize>, ...ExtractAttributes<TData>]
>;
export function size<
  TSize extends number,
  TData extends AnyTgpuData | AnyTgpuLooseData,
>(
  size: TSize,
  data: TData,
):
  | Decorated<
      UnwrapDecorated<TData> & AnyTgpuData,
      [Size<TSize>, ...ExtractAttributes<TData>]
    >
  | LooseDecorated<
      UnwrapDecorated<TData> & AnyTgpuLooseData,
      [Size<TSize>, ...ExtractAttributes<TData>]
    > {
  return attribute(data, { size });
}

export function isDecorated<
  T extends Decorated<AnyTgpuData, AnyAttributeTuple>,
>(value: T | unknown): value is T {
  return value instanceof DecoratedImpl;
}

export function isLooseDecorated<
  T extends LooseDecorated<AnyTgpuLooseData, AnyAttributeTuple>,
>(value: T | unknown): value is T {
  return value instanceof LooseDecoratedImpl;
}

export function getCustomAlignment(
  data: AnyTgpuData | AnyTgpuLooseData,
): number | undefined {
  if (isDecorated(data) || isLooseDecorated(data)) {
    return data.customAlignment;
  }
  return undefined;
}

// --------------
// Implementation
// --------------

class BaseDecoratedImpl<
  TInner extends AnyTgpuData | AnyTgpuLooseData,
  TAttribs extends AnyAttributeTuple,
> {
  // Type-token, not available at runtime
  public readonly __unwrapped!: Unwrap<TInner>;

  public readonly label?: string | undefined;
  public readonly byteAlignment: number;
  public readonly size: number;

  public readonly customAlignment: number | undefined;
  public readonly customSize: number | undefined;

  constructor(
    public readonly inner: TInner,
    public readonly attributes: TAttribs,
  ) {
    this.customAlignment = attributes.find(
      (a): a is Align<number> => 'align' in a,
    )?.align;
    this.customSize = attributes.find(
      (a): a is Size<number> => 'size' in a,
    )?.size;

    this.byteAlignment = this.customAlignment ?? inner.byteAlignment;
    this.size = this.measure(MaxValue).size;

    if (this.byteAlignment <= 0) {
      throw new Error(
        `Custom data alignment must be a positive number, got: ${this.byteAlignment}.`,
      );
    }

    if (Math.log2(this.byteAlignment) % 1 !== 0) {
      throw new Error(
        `Alignment has to be a power of 2, got: ${this.byteAlignment}.`,
      );
    }

    if (isDataNotLoose(this.inner)) {
      if (this.byteAlignment % this.inner.byteAlignment !== 0) {
        throw new Error(
          `Custom alignment has to be a multiple of the standard data byteAlignment. Got: ${this.byteAlignment}, expected multiple of: ${this.inner.byteAlignment}.`,
        );
      }
    }

    if (this.size < this.inner.size) {
      throw new Error(
        `Custom data size cannot be smaller then the standard data size. Got: ${this.size}, expected at least: ${this.inner.size}.`,
      );
    }

    if (this.size <= 0) {
      throw new Error(
        `Custom data size must be a positive number. Got: ${this.size}.`,
      );
    }
  }

  resolveReferences(ctx: IRefResolver): void {
    throw new RecursiveDataTypeError();
  }

  write(output: ISerialOutput, value: Parsed<Unwrap<TInner>>): void {
    alignIO(output, this.byteAlignment);

    const beginning = output.currentByteOffset;
    this.inner.write(output, value);
    output.seekTo(beginning + this.size);
  }

  read(input: ISerialInput): Parsed<Unwrap<TInner>> {
    alignIO(input, this.byteAlignment);

    const beginning = input.currentByteOffset;
    const value = this.inner.read(input) as Parsed<Unwrap<TInner>>;
    input.seekTo(beginning + this.size);
    return value;
  }

  measure(
    value: MaxValue | Parsed<Unwrap<TInner>>,
    measurer: IMeasurer | undefined = new Measurer(),
  ): IMeasurer {
    alignIO(measurer, this.byteAlignment);

    if (this.customSize !== undefined) {
      return measurer.add(this.customSize);
    }

    return this.inner.measure(value, measurer);
  }

  seekProperty(
    reference: MaxValue | Parsed<Unwrap<TInner>>,
    prop: keyof Unwrap<TInner>,
  ): { bufferOffset: number; schema: ISchema<unknown> } | null {
    return this.inner.seekProperty(reference, prop as never);
  }
}

class DecoratedImpl<
    TInner extends AnyTgpuData,
    TAttribs extends AnyAttributeTuple,
  >
  extends BaseDecoratedImpl<TInner, TAttribs>
  implements Decorated<TInner, TAttribs>
{
  public readonly isLoose = false as const;

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(this.inner);
  }
}

class LooseDecoratedImpl<
    TInner extends AnyTgpuLooseData,
    TAttribs extends AnyAttributeTuple,
  >
  extends BaseDecoratedImpl<TInner, TAttribs>
  implements LooseDecorated<TInner, TAttribs>
{
  public readonly isLoose = true as const;
}
