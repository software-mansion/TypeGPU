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
import type { BuiltinName } from '../builtinIdentifiers';
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
  type: 'align';
  alignment: T;
}

export interface Size<T extends number> {
  type: 'size';
  size: T;
}

export interface Builtin<T extends BuiltinName> {
  type: 'builtin';
  name: T;
}

export type AnyAttribute = Align<number> | Size<number> | Builtin<BuiltinName>;

export interface Decorated<
  TInner extends AnyTgpuData,
  TAttribs extends AnyAttribute[],
> extends TgpuData<Unwrap<TInner>> {
  readonly inner: TInner;
  readonly attributes: TAttribs;

  // Easy access to all attributes, if they exist
  readonly alignAttrib: number | undefined;
  readonly sizeAttrib: number | undefined;
  readonly builtinAttrib: BuiltinName | undefined;
}

export interface LooseDecorated<
  TInner extends AnyTgpuLooseData,
  TAttribs extends AnyAttribute[],
> extends TgpuLooseData<Unwrap<TInner>> {
  readonly inner: TInner;
  readonly attributes: TAttribs;

  // Easy access to all attributes, if they exist
  readonly alignAttrib: number | undefined;
  readonly sizeAttrib: number | undefined;
  readonly builtinAttrib: BuiltinName | undefined;
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
  AnyAttribute[]
>
  ? Inner
  : T extends LooseDecorated<infer Inner, AnyAttribute[]>
    ? Inner
    : T;

/**
 * Decorates a data-type `TData` with an attribute `TAttrib`.
 *
 * - if `TData` is loose
 *   - if `TData` is already `LooseDecorated`
 *     - Prepend `TAttrib` to the existing attribute tuple.
 *   - else
 *     - Wrap `TData` with `LooseDecorated` and a single attribute `[TAttrib]`
 * - else
 *   - if `TData` is already `Decorated`
 *     - Prepend `TAttrib` to the existing attribute tuple.
 *   - else
 *     - Wrap `TData` with `Decorated` and a single attribute `[TAttrib]`
 */
export type Decorate<
  TData extends AnyTgpuData | AnyTgpuLooseData,
  TAttrib extends AnyAttribute,
> = TData extends AnyTgpuData
  ? Decorated<UnwrapDecorated<TData>, [TAttrib, ...ExtractAttributes<TData>]>
  : TData extends AnyTgpuLooseData
    ? LooseDecorated<
        UnwrapDecorated<TData>,
        [TAttrib, ...ExtractAttributes<TData>]
      >
    : never;

export type IsBuiltin<T> = ExtractAttributes<T>[number] extends []
  ? false
  : ExtractAttributes<T>[number] extends Builtin<BuiltinName>
    ? true
    : false;

export function attribute<
  TData extends AnyTgpuData | AnyTgpuLooseData,
  TAttrib extends AnyAttribute,
>(data: TData, attrib: TAttrib) {
  if (isDecorated(data)) {
    return new DecoratedImpl(data.inner, [attrib, ...data.attributes]);
  }

  if (isLooseDecorated(data)) {
    return new LooseDecoratedImpl(data.inner, [attrib, ...data.attributes]);
  }

  if (isDataLoose(data)) {
    return new LooseDecoratedImpl(data, [attrib]);
  }

  return new DecoratedImpl(data, [attrib]);
}

/**
 * Gives the wrapped data-type a custom byte alignment. Useful in order to
 * fulfill uniform alignment requirements.
 *
 * @example
 * const Data = d.struct({
 *   a: u32, // takes up 4 bytes
 *   // 12 bytes of padding, because `b` is custom aligned to multiples of 16 bytes
 *   b: d.align(16, u32),
 * });
 *
 * @param alignment The multiple of bytes this data should align itself to.
 * @param data The data-type to align.
 */
export function align<
  TAlign extends number,
  TData extends AnyTgpuData | AnyTgpuLooseData,
>(alignment: TAlign, data: TData): Decorate<TData, Align<TAlign>> {
  return attribute(data, { type: 'align', alignment }) as Decorate<
    TData,
    Align<TAlign>
  >;
}

/**
 * Adds padding bytes after the wrapped data-type, until the whole value takes up `size` bytes.
 *
 * @example
 * const Data = d.struct({
 *   a: d.size(16, u32), // takes up 16 bytes, instead of 4
 *   b: u32, // starts at byte 16, because `a` has a custom size
 * });
 *
 * @param size The amount of bytes that should be reserved for this data-type.
 * @param data The data-type to wrap.
 */
export function size<
  TSize extends number,
  TData extends AnyTgpuData | AnyTgpuLooseData,
>(size: TSize, data: TData): Decorate<TData, Size<TSize>> {
  return attribute(data, { type: 'size', size }) as Decorate<
    TData,
    Size<TSize>
  >;
}

export function isDecorated<T extends Decorated<AnyTgpuData, AnyAttribute[]>>(
  value: T | unknown,
): value is T {
  return value instanceof DecoratedImpl;
}

export function isLooseDecorated<
  T extends LooseDecorated<AnyTgpuLooseData, AnyAttribute[]>,
>(value: T | unknown): value is T {
  return value instanceof LooseDecoratedImpl;
}

export function getCustomAlignment(
  data: AnyTgpuData | AnyTgpuLooseData,
): number | undefined {
  if (isDecorated(data) || isLooseDecorated(data)) {
    return data.alignAttrib;
  }
  return undefined;
}

export function isBuiltin<
  T extends
    | Decorated<AnyTgpuData, AnyAttribute[]>
    | LooseDecorated<AnyTgpuLooseData, AnyAttribute[]>,
>(value: T | unknown): value is T {
  return (
    (isDecorated(value) || isLooseDecorated(value)) &&
    value.builtinAttrib !== undefined
  );
}

export function getAttributesString<T extends AnyTgpuData>(field: T): string {
  if (!isDecorated(field) && !isLooseDecorated(field)) {
    return '';
  }

  return field.attributes
    .map((attrib) => {
      if (attrib.type === 'align') {
        return `@align(${attrib.alignment}) `;
      }

      if (attrib.type === 'size') {
        return `@size(${attrib.size}) `;
      }

      if (attrib.type === 'builtin') {
        return `@builtin(${attrib.name}) `;
      }

      return '';
    })
    .join('');
}

// --------------
// Implementation
// --------------

class BaseDecoratedImpl<
  TInner extends AnyTgpuData | AnyTgpuLooseData,
  TAttribs extends AnyAttribute[],
> {
  // Type-token, not available at runtime
  public readonly __unwrapped!: Unwrap<TInner>;

  public readonly label?: string | undefined;
  public readonly byteAlignment: number;
  public readonly size: number;

  public readonly alignAttrib: number | undefined;
  public readonly sizeAttrib: number | undefined;
  public readonly builtinAttrib: BuiltinName | undefined;

  constructor(
    public readonly inner: TInner,
    public readonly attributes: TAttribs,
  ) {
    this.alignAttrib = attributes.find(
      (a): a is Align<number> => a.type === 'align',
    )?.alignment;
    this.sizeAttrib = attributes.find(
      (a): a is Size<number> => a.type === 'size',
    )?.size;
    this.builtinAttrib = attributes.find(
      (a): a is Builtin<BuiltinName> => a.type === 'builtin',
    )?.name;

    this.byteAlignment = this.alignAttrib ?? inner.byteAlignment;
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

  resolveReferences(_: IRefResolver): void {
    throw new RecursiveDataTypeError();
  }

  write(output: ISerialOutput, value: Parsed<Unwrap<TInner>>): void {
    alignIO(output, this.alignAttrib ?? 1);

    const beginning = output.currentByteOffset;
    this.inner.write(output, value);
    output.seekTo(beginning + this.size);
  }

  read(input: ISerialInput): Parsed<Unwrap<TInner>> {
    alignIO(input, this.alignAttrib ?? 1);

    const beginning = input.currentByteOffset;
    const value = this.inner.read(input) as Parsed<Unwrap<TInner>>;
    input.seekTo(beginning + this.size);
    return value;
  }

  measure(
    value: MaxValue | Parsed<Unwrap<TInner>>,
    measurer: IMeasurer | undefined = new Measurer(),
  ): IMeasurer {
    alignIO(measurer, this.alignAttrib ?? 1);

    if (this.sizeAttrib !== undefined) {
      return measurer.add(this.sizeAttrib);
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

class DecoratedImpl<TInner extends AnyTgpuData, TAttribs extends AnyAttribute[]>
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
    TAttribs extends AnyAttribute[],
  >
  extends BaseDecoratedImpl<TInner, TAttribs>
  implements LooseDecorated<TInner, TAttribs>
{
  public readonly isLoose = true as const;
}
