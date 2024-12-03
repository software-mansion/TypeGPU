import type { Infer, InferRecord } from '../shared/repr';
import { vertexFormats } from '../shared/vertexFormat';
import type { LooseDecorated } from './attributes';
import type { F32Cast, I32Cast, U32Cast } from './numeric';
import type {
  Vec2fConstructor,
  Vec2iConstructor,
  Vec2uConstructor,
  Vec3fConstructor,
  Vec3iConstructor,
  Vec3uConstructor,
  Vec4fConstructor,
  Vec4iConstructor,
  Vec4uConstructor,
} from './vector';
import type { PackedData } from './vertexFormatData';
import type * as wgsl from './wgslTypes';
import { isWgslData } from './wgslTypes';

export type Bool = wgsl.Bool;
export type F32 = wgsl.F32 & F32Cast;
export type I32 = wgsl.I32 & I32Cast;
export type U32 = wgsl.U32 & U32Cast;
export type Vec2f = wgsl.Vec2f & Vec2fConstructor;
export type Vec2i = wgsl.Vec2i & Vec2iConstructor;
export type Vec2u = wgsl.Vec2u & Vec2uConstructor;
export type Vec3f = wgsl.Vec3f & Vec3fConstructor;
export type Vec3i = wgsl.Vec3i & Vec3iConstructor;
export type Vec3u = wgsl.Vec3u & Vec3uConstructor;
export type Vec4f = wgsl.Vec4f & Vec4fConstructor;
export type Vec4i = wgsl.Vec4i & Vec4iConstructor;
export type Vec4u = wgsl.Vec4u & Vec4uConstructor;

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
  readonly __repr: Infer<TElement>[];
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
  readonly __repr: InferRecord<TProps>;
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
