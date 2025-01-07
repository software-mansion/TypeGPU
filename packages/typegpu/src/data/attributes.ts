import type { Infer, MemIdentity } from '../shared/repr';
import { alignmentOf } from './alignmentOf';
import {
  type AnyData,
  type AnyLooseData,
  type LooseDecorated,
  type LooseTypeLiteral,
  isLooseData,
  isLooseDecorated,
} from './dataTypes';
import type { Exotic } from './exotic';
import { sizeOf } from './sizeOf';
import {
  type Align,
  type AnyWgslData,
  type BaseWgslData,
  type Builtin,
  type Decorated,
  type Location,
  type Size,
  type WgslTypeLiteral,
  isAlignAttrib,
  isBuiltinAttrib,
  isDecorated,
  isSizeAttrib,
  isWgslData,
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

export type ExtractAttributes<T> = T extends {
  readonly attribs: unknown[];
}
  ? T['attribs']
  : [];

type Undecorate<T> = T extends { readonly inner: infer TInner } ? TInner : T;

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
  ? Decorated<Undecorate<TData>, [TAttrib, ...ExtractAttributes<TData>]>
  : TData['type'] extends LooseTypeLiteral
    ? LooseDecorated<Undecorate<TData>, [TAttrib, ...ExtractAttributes<TData>]>
    : never;

export type IsBuiltin<T> = ExtractAttributes<T>[number] extends []
  ? false
  : ExtractAttributes<T>[number] extends Builtin<BuiltinName>
    ? true
    : false;

export type HasCustomLocation<T> = ExtractAttributes<T>[number] extends []
  ? false
  : ExtractAttributes<T>[number] extends Location<number>
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
): Decorate<Exotic<TData>, Align<TAlign>> {
  // biome-ignore lint/suspicious/noExplicitAny: <tired of lying to types>
  return attribute(data, { type: '@align', value: alignment }) as any;
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
): Decorate<Exotic<TData>, Size<TSize>> {
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
): Decorate<Exotic<TData>, Location<TLocation>> {
  // biome-ignore lint/suspicious/noExplicitAny: <tired of lying to types>
  return attribute(data, { type: '@location', value: location }) as any;
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

export function getAttributesString<T extends BaseWgslData>(field: T): string {
  if (!isDecorated(field) && !isLooseDecorated(field)) {
    return '';
  }

  return (field.attribs as AnyAttribute[])
    .map((attrib) => `${attrib.type}(${attrib.value}) `)
    .join('');
}

// --------------
// Implementation
// --------------

class BaseDecoratedImpl<
  TInner extends BaseWgslData,
  TAttribs extends unknown[],
> {
  // Type-token, not available at runtime
  public readonly '~repr'!: Infer<TInner>;

  constructor(
    public readonly inner: TInner,
    public readonly attribs: TAttribs,
  ) {
    const alignAttrib = attribs.find(isAlignAttrib)?.value;
    const sizeAttrib = attribs.find(isSizeAttrib)?.value;

    if (alignAttrib !== undefined) {
      if (alignAttrib <= 0) {
        throw new Error(
          `Custom data alignment must be a positive number, got: ${alignAttrib}.`,
        );
      }

      if (Math.log2(alignAttrib) % 1 !== 0) {
        throw new Error(
          `Alignment has to be a power of 2, got: ${alignAttrib}.`,
        );
      }

      if (isWgslData(this.inner)) {
        if (alignAttrib % alignmentOf(this.inner) !== 0) {
          throw new Error(
            `Custom alignment has to be a multiple of the standard data alignment. Got: ${alignAttrib}, expected multiple of: ${alignmentOf(this.inner)}.`,
          );
        }
      }
    }

    if (sizeAttrib !== undefined) {
      if (sizeAttrib < sizeOf(this.inner)) {
        throw new Error(
          `Custom data size cannot be smaller then the standard data size. Got: ${sizeAttrib}, expected at least: ${sizeOf(this.inner)}.`,
        );
      }

      if (sizeAttrib <= 0) {
        throw new Error(
          `Custom data size must be a positive number. Got: ${sizeAttrib}.`,
        );
      }
    }
  }
}

class DecoratedImpl<TInner extends BaseWgslData, TAttribs extends unknown[]>
  extends BaseDecoratedImpl<TInner, TAttribs>
  implements Decorated<TInner, TAttribs>
{
  public readonly type = 'decorated';
  public readonly '~memIdent'!: TAttribs extends Location<number>[]
    ? MemIdentity<TInner> | Decorated<MemIdentity<TInner>, TAttribs>
    : Decorated<TInner, TAttribs>;
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
