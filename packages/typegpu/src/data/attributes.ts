import type { ISerialInput, Parsed, Unwrap } from 'typed-binary';
import type { Infer } from '../shared/repr';
import alignIO from './alignIO';
import { dataReaders } from './dataIO';
import {
  type AnyData,
  type AnyLooseData,
  type LooseTypeLiteral,
  isData,
  isLooseData,
} from './dataTypes';
import {
  type Align,
  type AnyWgslData,
  type BaseWgslData,
  type Builtin,
  type Decorated,
  type Location,
  type Size,
  type WgslTypeLiteral,
  alignmentOfData,
  isAlignAttrib,
  isBuiltinAttrib,
  isLocationAttrib,
  isSizeAttrib,
  sizeOfData,
} from './wgslTypes';

// ----------
// Public API
// ----------

export const builtinNames = [
  'vertex_index',
  'instance_index',
  'position',
  'clip_distances',
  'front_facing',
  'frag_depth',
  'sample_index',
  'sample_mask',
  'fragment',
  'local_invocation_id',
  'local_invocation_index',
  'global_invocation_id',
  'workgroup_id',
  'num_workgroups',
] as const;

export type BuiltinName = (typeof builtinNames)[number];

export type AnyAttribute =
  | Align<number>
  | Size<number>
  | Location<number>
  | Builtin<BuiltinName>;

export interface BaseDecorated<
  TInner extends BaseWgslData = BaseWgslData,
  TAttribs extends unknown[] = unknown[],
> {
  readonly size: number;
  readonly alignment: number;
  readonly inner: TInner;
  readonly attribs: TAttribs;
}

export interface LooseDecorated<
  TInner extends BaseWgslData = BaseWgslData,
  TAttribs extends unknown[] = unknown[],
> extends BaseDecorated<TInner, TAttribs> {
  readonly type: 'loose-decorated';
}

export type ExtractAttributes<T> = T extends {
  readonly attribs: unknown[];
}
  ? T['attribs']
  : never;

export type UnwrapDecorated<T> = T extends { readonly inner: infer TInner }
  ? TInner
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
  TData extends BaseWgslData,
  TAttrib extends AnyAttribute,
> = TData['type'] extends WgslTypeLiteral
  ? Decorated<UnwrapDecorated<TData>, [TAttrib, ...ExtractAttributes<TData>]>
  : TData['type'] extends LooseTypeLiteral
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
  TData extends BaseWgslData,
  TAttrib extends AnyAttribute,
>(data: TData, attrib: TAttrib): Decorated | LooseDecorated {
  if (isDecorated(data)) {
    return new DecoratedImpl(data.inner, [
      attrib,
      ...data.attribs,
    ]) as Decorated;
  }

  if (isLooseDecorated(data)) {
    return new LooseDecoratedImpl(data.inner, [
      attrib,
      ...data.attribs,
    ]) as LooseDecorated;
  }

  if (isLooseData(data)) {
    return new LooseDecoratedImpl(data, [attrib]) as unknown as LooseDecorated;
  }

  return new DecoratedImpl(data, [attrib]) as unknown as Decorated;
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
export function align<TAlign extends number, TData extends AnyData>(
  alignment: TAlign,
  data: TData,
): Decorate<TData, Align<TAlign>> {
  return attribute(data, {
    type: '@align',
    value: alignment,
    // biome-ignore lint/suspicious/noExplicitAny: <tired of lying to types>
  }) as any;
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
export function size<TSize extends number, TData extends AnyData>(
  size: TSize,
  data: TData,
): Decorate<TData, Size<TSize>> {
  // biome-ignore lint/suspicious/noExplicitAny: <tired of lying to types>
  return attribute(data, { type: '@size', value: size }) as any;
}

/**
 * Assigns an explicit numeric location to a struct member or a parameter that has this type.
 *
 * @example
 * const Data = d.ioStruct({
 *   a: d.u32, // has implicit location 0
 *   b: d.location(5, d.u32),
 *   c: d.u32, // has implicit location 6
 * });
 *
 * @param location The explicit numeric location.
 * @param data The data-type to wrap.
 */
export function location<TLocation extends number, TData extends AnyData>(
  location: TLocation,
  data: TData,
): Decorate<TData, Location<TLocation>> {
  // biome-ignore lint/suspicious/noExplicitAny: <tired of lying to types>
  return attribute(data, { type: '@location', value: location }) as any;
}

export function isDecorated<T extends Decorated>(
  value: T | unknown,
): value is T {
  return (value as Decorated)?.type === 'decorated';
}

export function isLooseDecorated<T extends LooseDecorated>(
  value: T | unknown,
): value is T {
  return (value as LooseDecorated)?.type === 'loose-decorated';
}

export function getCustomAlignment(data: BaseWgslData): number | undefined {
  return (data as unknown as BaseDecorated).attribs?.find(isAlignAttrib)?.value;
}

export function getCustomLocation(data: BaseWgslData): number | undefined {
  return (data as unknown as BaseDecorated).attribs?.find(isLocationAttrib)
    ?.value;
}

export function isBuiltin<
  T extends
    | Decorated<AnyWgslData, AnyAttribute[]>
    | LooseDecorated<AnyLooseData, AnyAttribute[]>,
>(value: T | unknown): value is T {
  return (
    (isDecorated(value) || isLooseDecorated(value)) &&
    value.attribs.find(isBuiltinAttrib) !== undefined
  );
}

export function getAttributesString<T extends AnyWgslData>(field: T): string {
  if (!isDecorated(field) && !isLooseDecorated(field)) {
    return '';
  }

  return (field.attribs as AnyAttribute[])
    .map((attrib) => {
      if (attrib.type === '@align') {
        return `@align(${attrib.value}) `;
      }

      if (attrib.type === '@size') {
        return `@size(${attrib.value}) `;
      }

      if (attrib.type === '@location') {
        return `@location(${attrib.value}) `;
      }

      if (attrib.type === '@builtin') {
        return `@builtin(${attrib.value}) `;
      }

      return '';
    })
    .join('');
}

// --------------
// Implementation
// --------------

class BaseDecoratedImpl<TInner, TAttribs extends unknown[]> {
  // Type-token, not available at runtime
  public readonly __repr!: Infer<TInner>;

  public readonly label?: string | undefined;
  public readonly alignment: number;
  public readonly size: number;

  private readonly _alignAttrib: number | undefined;
  private readonly _sizeAttrib: number | undefined;

  constructor(
    public readonly inner: TInner,
    public readonly attribs: TAttribs,
  ) {
    this._alignAttrib = attribs.find(isAlignAttrib)?.value;
    this._sizeAttrib = attribs.find(isSizeAttrib)?.value;

    this.alignment = this._alignAttrib ?? alignmentOfData(inner);
    this.size = this._sizeAttrib ?? sizeOfData(inner);

    if (this.alignment <= 0) {
      throw new Error(
        `Custom data alignment must be a positive number, got: ${this.alignment}.`,
      );
    }

    if (Math.log2(this.alignment) % 1 !== 0) {
      throw new Error(
        `Alignment has to be a power of 2, got: ${this.alignment}.`,
      );
    }

    if (isData(this.inner)) {
      if (this.alignment % alignmentOfData(this.inner) !== 0) {
        throw new Error(
          `Custom alignment has to be a multiple of the standard data alignment. Got: ${this.alignment}, expected multiple of: ${alignmentOfData(this.inner)}.`,
        );
      }
    }

    if (this.size < sizeOfData(this.inner)) {
      throw new Error(
        `Custom data size cannot be smaller then the standard data size. Got: ${this.size}, expected at least: ${sizeOfData(this.inner)}.`,
      );
    }

    if (this.size <= 0) {
      throw new Error(
        `Custom data size must be a positive number. Got: ${this.size}.`,
      );
    }
  }

  read(input: ISerialInput): Parsed<Unwrap<TInner>> {
    alignIO(input, this._alignAttrib ?? 1);

    const beginning = input.currentByteOffset;
    const reader = dataReaders[(this.inner as AnyData)?.type];
    const value = reader?.(input, this.inner) as Parsed<Unwrap<TInner>>;
    input.seekTo(beginning + this.size);
    return value;
  }
}

class DecoratedImpl<TInner extends BaseWgslData, TAttribs extends unknown[]>
  extends BaseDecoratedImpl<TInner, TAttribs>
  implements Decorated<TInner, TAttribs>
{
  public readonly type = 'decorated';
}

class LooseDecoratedImpl<
    TInner extends BaseWgslData,
    TAttribs extends unknown[],
  >
  extends BaseDecoratedImpl<TInner, TAttribs>
  implements LooseDecorated<TInner, TAttribs>
{
  public readonly type = 'loose-decorated';
}
