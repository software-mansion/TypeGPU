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
import type {
  AnyWgslData,
  BaseWgslData,
  Bool as WgslBool,
  F32 as WgslF32,
  I32 as WgslI32,
  U32 as WgslU32,
  Vec2f as WgslVec2f,
  Vec2i as WgslVec2i,
  Vec2u as WgslVec2u,
  Vec3f as WgslVec3f,
  Vec3i as WgslVec3i,
  Vec3u as WgslVec3u,
  Vec4f as WgslVec4f,
  Vec4i as WgslVec4i,
  Vec4u as WgslVec4u,
} from './wgslTypes';
import { isWgslData } from './wgslTypes';

export type Bool = WgslBool;
export type F32 = WgslF32 & F32Cast;
export type I32 = WgslI32 & I32Cast;
export type U32 = WgslU32 & U32Cast;
export type Vec2f = WgslVec2f & Vec2fConstructor;
export type Vec2i = WgslVec2i & Vec2iConstructor;
export type Vec2u = WgslVec2u & Vec2uConstructor;
export type Vec3f = WgslVec3f & Vec3fConstructor;
export type Vec3i = WgslVec3i & Vec3iConstructor;
export type Vec3u = WgslVec3u & Vec3uConstructor;
export type Vec4f = WgslVec4f & Vec4fConstructor;
export type Vec4i = WgslVec4i & Vec4iConstructor;
export type Vec4u = WgslVec4u & Vec4uConstructor;

/**
 * Array schema constructed via `d.looseArrayOf` function.
 *
 * Useful for defining vertex buffers.
 * Elements in the schema are not aligned in respect to their `byteAlignment`,
 * unless they are explicitly decorated with the custom align attribute
 * via `d.align` function.
 */
export interface LooseArray<TElement extends BaseWgslData = BaseWgslData> {
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
  TProps extends Record<string, BaseWgslData> = Record<string, BaseWgslData>,
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

export type AnyData = AnyWgslData | AnyLooseData;
