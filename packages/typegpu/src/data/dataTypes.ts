import type { Infer } from '../shared/repr';
import type { LooseDecorated } from './attributes';
import { type AnyWgslData, isWgslData } from './wgslTypes';

/**
 * Array schema constructed via `d.looseArrayOf` function.
 *
 * Useful for defining vertex buffers.
 * Elements in the schema are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 */
export interface LooseArray<TElement extends AnyData = AnyData> {
  readonly type: 'loose-array';
  readonly size: number;
  readonly alignment: number;
  readonly length: number;
  readonly elementType: TElement;
  readonly __repr: Infer<TElement>[];
}

const looseTypeLiterals = [
  'loose-struct',
  'loose-array',
  'loose-decorated',
] as const;

export type LooseTypeLiteral = (typeof looseTypeLiterals)[number];

export type AnyLooseData = LooseArray | LooseDecorated;

export function isLooseData(data: unknown): data is AnyLooseData {
  return looseTypeLiterals.includes((data as AnyLooseData)?.type);
}

export function isData(value: unknown): value is AnyData {
  return isWgslData(value) || isLooseData(value);
}

export type AnyData = AnyWgslData | AnyLooseData;
