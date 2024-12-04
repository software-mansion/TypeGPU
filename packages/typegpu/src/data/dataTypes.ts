import type { Infer, InferRecord } from '../shared/repr';
import { vertexFormats } from '../shared/vertexFormat';
import type { LooseDecorated } from './attributes';
import type { PackedData } from './vertexFormatData';
import type * as wgsl from './wgslTypes';
import { isWgslData } from './wgslTypes';

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

export function isData(value: unknown): value is AnyData {
  return isWgslData(value) || isLooseData(value);
}

export type AnyData = wgsl.AnyWgslData | AnyLooseData;
