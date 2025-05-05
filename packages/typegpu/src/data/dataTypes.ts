import type { TgpuNamable } from '../namable.ts';
import type {
  $repr,
  Infer,
  InferGPURecord,
  InferPartial,
  InferPartialRecord,
  InferRecord,
  MemIdentityRecord,
} from '../shared/repr.ts';
import { $internal } from '../shared/symbols.ts';
import type { Prettify } from '../shared/utilityTypes.ts';
import { vertexFormats } from '../shared/vertexFormat.ts';
import type { FnArgsConversionHint } from '../types.ts';
import type { PackedData } from './vertexFormatData.ts';
import * as wgsl from './wgslTypes.ts';

export type TgpuDualFn<TImpl extends (...args: unknown[]) => unknown> =
  TImpl & {
    [$internal]: {
      implementation: TImpl | string;
      argTypes: FnArgsConversionHint;
    };
  };

/**
 * Array schema constructed via `d.disarrayOf` function.
 *
 * Useful for defining vertex buffers.
 * Elements in the schema are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 */
export interface Disarray<TElement extends wgsl.BaseData = wgsl.BaseData> {
  readonly [$internal]: true;
  readonly type: 'disarray';
  readonly elementCount: number;
  readonly elementType: TElement;
  readonly [$repr]: Infer<TElement>[];
  readonly '~reprPartial': { idx: number; value: InferPartial<TElement> }[];
}

/**
 * Struct schema constructed via `d.unstruct` function.
 *
 * Useful for defining vertex buffers, as the standard layout restrictions do not apply.
 * Members are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 */
export interface Unstruct<
  TProps extends Record<string, wgsl.BaseData> = Record<string, wgsl.BaseData>,
> extends TgpuNamable {
  readonly [$internal]: true;
  (props: Prettify<InferRecord<TProps>>): Prettify<InferRecord<TProps>>;
  readonly label?: string | undefined;
  readonly type: 'unstruct';
  readonly propTypes: TProps;
  readonly [$repr]: Prettify<InferRecord<TProps>>;
  readonly '~gpuRepr': Prettify<InferGPURecord<TProps>>;
  readonly '~memIdent': Unstruct<Prettify<MemIdentityRecord<TProps>>>;
  readonly '~reprPartial': Prettify<Partial<InferPartialRecord<TProps>>>;
}

// biome-ignore lint/suspicious/noExplicitAny: <we need the type to be broader than Unstruct<Record<string, BaseData>>
export type AnyUnstruct = Unstruct<any>;

export interface LooseDecorated<
  TInner extends wgsl.BaseData = wgsl.BaseData,
  TAttribs extends unknown[] = unknown[],
> {
  readonly [$internal]: true;
  readonly type: 'loose-decorated';
  readonly inner: TInner;
  readonly attribs: TAttribs;
  readonly [$repr]: Infer<TInner>;
}

const looseTypeLiterals = [
  'unstruct',
  'disarray',
  'loose-decorated',
  ...vertexFormats,
] as const;

export type LooseTypeLiteral = (typeof looseTypeLiterals)[number];

export type AnyLooseData = Disarray | AnyUnstruct | LooseDecorated | PackedData;

export function isLooseData(data: unknown): data is AnyLooseData {
  return (
    (data as AnyLooseData)?.[$internal] &&
    looseTypeLiterals.includes((data as AnyLooseData)?.type)
  );
}

/**
 * Checks whether the passed in value is a disarray schema,
 * as opposed to, e.g., a regular array schema.
 *
 * Array schemas can be used to describe uniform and storage buffers,
 * whereas disarray schemas cannot. Disarrays are useful for
 * defining vertex buffers instead.
 *
 * @example
 * isDisarray(d.arrayOf(d.u32, 4)) // false
 * isDisarray(d.disarrayOf(d.u32, 4)) // true
 * isDisarray(d.vec3f) // false
 */
export function isDisarray<T extends Disarray>(
  schema: T | unknown,
): schema is T {
  return (schema as T)?.[$internal] && (schema as T)?.type === 'disarray';
}

/**
 * Checks whether passed in value is a unstruct schema,
 * as opposed to, e.g., a struct schema.
 *
 * Struct schemas can be used to describe uniform and storage buffers,
 * whereas unstruct schemas cannot. Unstructs are useful for
 * defining vertex buffers instead.
 *
 * @example
 * isUnstruct(d.struct({ a: d.u32 })) // false
 * isUnstruct(d.unstruct({ a: d.u32 })) // true
 * isUnstruct(d.vec3f) // false
 */
export function isUnstruct<T extends Unstruct>(
  schema: T | unknown,
): schema is T {
  return (schema as T)?.[$internal] && (schema as T)?.type === 'unstruct';
}

export function isLooseDecorated<T extends LooseDecorated>(
  value: T | unknown,
): value is T {
  return (value as T)?.[$internal] && (value as T)?.type === 'loose-decorated';
}

export function getCustomAlignment(data: wgsl.BaseData): number | undefined {
  return (data as unknown as wgsl.Decorated | LooseDecorated).attribs?.find(
    wgsl.isAlignAttrib,
  )?.value;
}

export function getCustomSize(data: wgsl.BaseData): number | undefined {
  return (data as unknown as wgsl.Decorated | LooseDecorated).attribs?.find(
    wgsl.isSizeAttrib,
  )?.value;
}

export function getCustomLocation(data: wgsl.BaseData): number | undefined {
  return (data as unknown as wgsl.Decorated | LooseDecorated).attribs?.find(
    wgsl.isLocationAttrib,
  )?.value;
}

export function isData(value: unknown): value is AnyData {
  return wgsl.isWgslData(value) || isLooseData(value);
}

export type AnyData = wgsl.AnyWgslData | AnyLooseData;
export type AnyConcreteData = Exclude<
  AnyData,
  wgsl.AbstractInt | wgsl.AbstractFloat | wgsl.Void
>;
