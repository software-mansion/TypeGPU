import type {
  Infer,
  InferPartial,
  InferPartialRecord,
  InferRecord,
} from '../shared/repr';
import { vertexFormats } from '../shared/vertexFormat';
import type { PackedData } from './vertexFormatData';
import * as wgsl from './wgslTypes';

/**
 * Array schema constructed via `d.disarrayOf` function.
 *
 * Useful for defining vertex buffers.
 * Elements in the schema are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 */
export interface Disarray<
  TElement extends wgsl.BaseWgslData = wgsl.BaseWgslData,
> {
  readonly type: 'disarray';
  readonly elementCount: number;
  readonly elementType: TElement;
  readonly '~repr': Infer<TElement>[];
  readonly '~reprPartial': Record<number, InferPartial<TElement>>;
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
  TProps extends Record<string, wgsl.BaseWgslData> = Record<
    string,
    wgsl.BaseWgslData
  >,
> {
  readonly type: 'unstruct';
  readonly propTypes: TProps;
  readonly '~repr': InferRecord<TProps>;
  readonly '~reprPartial': Partial<InferPartialRecord<TProps>>;
}

export interface LooseDecorated<
  TInner extends wgsl.BaseWgslData = wgsl.BaseWgslData,
  TAttribs extends unknown[] = unknown[],
> {
  readonly type: 'loose-decorated';
  readonly inner: TInner;
  readonly attribs: TAttribs;
  readonly '~repr': Infer<TInner>;
}

const looseTypeLiterals = [
  'unstruct',
  'disarray',
  'loose-decorated',
  ...vertexFormats,
] as const;

export type LooseTypeLiteral = (typeof looseTypeLiterals)[number];

export type AnyLooseData = Disarray | Unstruct | LooseDecorated | PackedData;

export function isLooseData(data: unknown): data is AnyLooseData {
  return looseTypeLiterals.includes((data as AnyLooseData)?.type);
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
  return (schema as Disarray)?.type === 'disarray';
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
  return (schema as T)?.type === 'unstruct';
}

export function isLooseDecorated<T extends LooseDecorated>(
  value: T | unknown,
): value is T {
  return (value as T)?.type === 'loose-decorated';
}

export function getCustomAlignment(
  data: wgsl.BaseWgslData,
): number | undefined {
  return (data as unknown as wgsl.Decorated | LooseDecorated).attribs?.find(
    wgsl.isAlignAttrib,
  )?.value;
}

export function getCustomSize(data: wgsl.BaseWgslData): number | undefined {
  return (data as unknown as wgsl.Decorated | LooseDecorated).attribs?.find(
    wgsl.isSizeAttrib,
  )?.value;
}

export function getCustomLocation(data: wgsl.BaseWgslData): number | undefined {
  return (data as unknown as wgsl.Decorated | LooseDecorated).attribs?.find(
    wgsl.isLocationAttrib,
  )?.value;
}

export function isData(value: unknown): value is AnyData {
  return wgsl.isWgslData(value) || isLooseData(value);
}

export type AnyData = wgsl.AnyWgslData | AnyLooseData;
