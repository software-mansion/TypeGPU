import type {
  Infer,
  InferGPU,
  InferPartial,
  MemIdentity,
} from '../shared/repr.ts';
import { $internal } from '../shared/symbols.ts';
import type {
  $gpuRepr,
  $memIdent,
  $repr,
  $reprPartial,
} from '../shared/symbols.ts';
import { alignmentOf } from './alignmentOf.ts';
import {
  type AnyData,
  type AnyLooseData,
  isLooseData,
  isLooseDecorated,
  type LooseDecorated,
  type LooseTypeLiteral,
} from './dataTypes.ts';
import { sizeOf } from './sizeOf.ts';
import {
  type Align,
  type AnyWgslData,
  type BaseData,
  type Builtin,
  type Decorated,
  type FlatInterpolatableData,
  type FlatInterpolationType,
  type Interpolate,
  type InterpolationType,
  isAlignAttrib,
  isBuiltinAttrib,
  isDecorated,
  isSizeAttrib,
  isWgslData,
  type Location,
  type PerspectiveOrLinearInterpolatableData,
  type PerspectiveOrLinearInterpolationType,
  type Size,
  type WgslTypeLiteral,
} from './wgslTypes.ts';

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
  'subgroup_invocation_id',
  'subgroup_size',
] as const;

export type BuiltinName = (typeof builtinNames)[number];

export type AnyAttribute<
  AllowedBuiltins extends Builtin<BuiltinName> = Builtin<BuiltinName>,
> =
  | Align<number>
  | Size<number>
  | Location<number>
  | Interpolate<InterpolationType>
  | AllowedBuiltins;

export type ExtractAttributes<T> = T extends {
  readonly attribs: unknown[];
} ? T['attribs']
  : [];

export type Undecorate<T> = T extends { readonly inner: infer TInner } ? TInner
  : T;

export type UndecorateRecord<T extends Record<string, unknown>> = {
  [Key in keyof T]: Undecorate<T[Key]>;
};

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
  TData extends BaseData,
  TAttrib extends AnyAttribute,
> = TData['type'] extends WgslTypeLiteral
  ? Decorated<Undecorate<TData>, [TAttrib, ...ExtractAttributes<TData>]>
  : TData['type'] extends LooseTypeLiteral
    ? LooseDecorated<Undecorate<TData>, [TAttrib, ...ExtractAttributes<TData>]>
  : never;

export type IsBuiltin<T> = ExtractAttributes<T>[number] extends [] ? false
  : ExtractAttributes<T>[number] extends Builtin<BuiltinName> ? true
  : false;

export type HasCustomLocation<T> = ExtractAttributes<T>[number] extends []
  ? false
  : ExtractAttributes<T>[number] extends Location ? true
  : false;

export function attribute<TData extends BaseData, TAttrib extends AnyAttribute>(
  data: TData,
  attrib: TAttrib,
): Decorated | LooseDecorated {
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
    [$internal]: true,
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
  return attribute(data, {
    [$internal]: true,
    type: '@size',
    value: size,
    // biome-ignore lint/suspicious/noExplicitAny: <tired of lying to types>
  }) as any;
}

/**
 * Assigns an explicit numeric location to a struct member or a parameter that has this type.
 *
 * @example
 * const VertexOutput = {
 *   a: d.u32, // has implicit location 0
 *   b: d.location(5, d.u32),
 *   c: d.u32, // has implicit location 6
 * };
 *
 * @param location The explicit numeric location.
 * @param data The data-type to wrap.
 */
export function location<TLocation extends number, TData extends AnyData>(
  location: TLocation,
  data: TData,
): Decorate<TData, Location<TLocation>> {
  return attribute(data, {
    [$internal]: true,
    type: '@location',
    value: location,
    // biome-ignore lint/suspicious/noExplicitAny: <tired of lying to types>
  }) as any;
}

/**
 * Specifies how user-defined vertex shader output (fragment shader input)
 * must be interpolated.
 *
 * Tip: Integer outputs cannot be interpolated.
 *
 * @example
 * const VertexOutput = {
 *   a: d.f32, // has implicit 'perspective, center' interpolation
 *   b: d.interpolate('linear, sample', d.f32),
 * };
 *
 * @param interpolationType How data should be interpolated.
 * @param data The data-type to wrap.
 */
export function interpolate<
  TInterpolation extends PerspectiveOrLinearInterpolationType,
  TData extends PerspectiveOrLinearInterpolatableData,
>(
  interpolationType: TInterpolation,
  data: TData,
): Decorate<TData, Interpolate<TInterpolation>>;

/**
 * Specifies how user-defined vertex shader output (fragment shader input)
 * must be interpolated.
 *
 * Tip: Default sampling method of `flat` is `first`. Unless you specifically
 * need deterministic behavior provided by `'flat, first'`, prefer explicit
 * `'flat, either'` as it could be slightly faster in hardware.
 *
 * @example
 * const VertexOutput = {
 *   a: d.f32, // has implicit 'perspective, center' interpolation
 *   b: d.interpolate('flat, either', d.u32), // integer outputs cannot interpolate
 * };
 *
 * @param interpolationType How data should be interpolated.
 * @param data The data-type to wrap.
 */
export function interpolate<
  TInterpolation extends FlatInterpolationType,
  TData extends FlatInterpolatableData,
>(
  interpolationType: TInterpolation,
  data: TData,
): Decorate<TData, Interpolate<TInterpolation>>;

export function interpolate<
  TInterpolation extends InterpolationType,
  TData extends AnyData,
>(
  interpolationType: TInterpolation,
  data: TData,
): Decorate<TData, Interpolate<TInterpolation>> {
  return attribute(data, {
    [$internal]: true,
    type: '@interpolate',
    value: interpolationType,
    // biome-ignore lint/suspicious/noExplicitAny: <tired of lying to types>
  }) as any;
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

export function getAttributesString<T extends BaseData>(field: T): string {
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

class BaseDecoratedImpl<TInner extends BaseData, TAttribs extends unknown[]> {
  public readonly [$internal] = true;

  // Type-tokens, not available at runtime
  declare readonly [$repr]: Infer<TInner>;
  // ---

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
            `Custom alignment has to be a multiple of the standard data alignment. Got: ${alignAttrib}, expected multiple of: ${
              alignmentOf(this.inner)
            }.`,
          );
        }
      }
    }

    if (sizeAttrib !== undefined) {
      if (sizeAttrib < sizeOf(this.inner)) {
        throw new Error(
          `Custom data size cannot be smaller then the standard data size. Got: ${sizeAttrib}, expected at least: ${
            sizeOf(this.inner)
          }.`,
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

class DecoratedImpl<TInner extends BaseData, TAttribs extends unknown[]>
  extends BaseDecoratedImpl<TInner, TAttribs>
  implements Decorated<TInner, TAttribs> {
  public readonly [$internal] = true;
  public readonly type = 'decorated';

  // Type-tokens, not available at runtime
  declare readonly [$gpuRepr]: InferGPU<TInner>;
  declare readonly [$reprPartial]: InferPartial<TInner>;
  declare readonly [$memIdent]: TAttribs extends Location[]
    ? MemIdentity<TInner> | Decorated<MemIdentity<TInner>, TAttribs>
    : Decorated<MemIdentity<TInner>, TAttribs>;
  // ---
}

class LooseDecoratedImpl<TInner extends BaseData, TAttribs extends unknown[]>
  extends BaseDecoratedImpl<TInner, TAttribs>
  implements LooseDecorated<TInner, TAttribs> {
  public readonly [$internal] = true;
  public readonly type = 'loose-decorated';
}
