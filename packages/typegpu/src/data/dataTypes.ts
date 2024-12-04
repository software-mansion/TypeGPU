import type { Infer, InferRecord } from '../shared/repr';
import { vertexFormats } from '../shared/vertexFormat';
import type { PackedData } from './vertexFormatData';
import * as wgsl from './wgslTypes';

/**
 * Array schema constructed via `d.looseArrayOf` function.
 *
 * Useful for defining vertex buffers.
 * Elements in the schema are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 */
export interface LooseArray<
  TElement extends wgsl.BaseWgslData = wgsl.BaseWgslData,
> {
  readonly type: 'loose-array';
  readonly length: number;
  readonly elementType: TElement;
  readonly '~repr': Infer<TElement>[];
}

/**
 * Struct schema constructed via `d.looseStruct` function.
 *
 * Useful for defining vertex buffers, as the standard layout restrictions do not apply.
 * Members are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 */
export interface LooseStruct<
  TProps extends Record<string, wgsl.BaseWgslData> = Record<
    string,
    wgsl.BaseWgslData
  >,
> {
  readonly type: 'loose-struct';
  readonly propTypes: TProps;
  readonly '~repr': InferRecord<TProps>;
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
  'loose-struct',
  'loose-array',
  'loose-decorated',
  ...vertexFormats,
] as const;

export type LooseTypeLiteral = (typeof looseTypeLiterals)[number];

export type AnyLooseData =
  | LooseArray
  | LooseStruct
  | LooseDecorated
  | PackedData;

export function isLooseData(data: unknown): data is AnyLooseData {
  return looseTypeLiterals.includes((data as AnyLooseData)?.type);
}

/**
 * Checks whether the passed in value is a loose-array schema,
 * as opposed to, e.g., a regular array schema.
 *
 * Array schemas can be used to describe uniform and storage buffers,
 * whereas looseArray schemas cannot. Loose arrays are useful for
 * defining vertex buffers instead.
 *
 * @example
 * isLooseArray(d.arrayOf(d.u32, 4)) // false
 * isLooseArray(d.looseArrayOf(d.u32, 4)) // true
 * isLooseArray(d.vec3f) // false
 */
export function isLooseArray<T extends LooseArray>(
  schema: T | unknown,
): schema is T {
  return (schema as LooseArray)?.type === 'loose-array';
}

/**
 * Checks whether passed in value is a looseStruct schema,
 * as opposed to, e.g., a struct schema.
 *
 * Struct schemas can be used to describe uniform and storage buffers,
 * whereas looseStruct schemas cannot. Loose structs are useful for
 * defining vertex buffers instead.
 *
 * @example
 * isLooseStruct(d.struct({ a: d.u32 })) // false
 * isLooseStruct(d.looseStruct({ a: d.u32 })) // true
 * isLooseStruct(d.vec3f) // false
 */
export function isLooseStruct<T extends LooseStruct>(
  schema: T | unknown,
): schema is T {
  return (schema as T)?.type === 'loose-struct';
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
