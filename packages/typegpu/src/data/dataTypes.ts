import type { Infer, InferRecord } from '../shared/repr';

export interface NumberArrayView {
  readonly length: number;
  [n: number]: number;
}

// #region Instance Types

export interface vec2f extends NumberArrayView {
  readonly kind: 'vec2f';
  x: number;
  y: number;
}

export interface vec2i extends NumberArrayView {
  readonly kind: 'vec2i';
  x: number;
  y: number;
}

export interface vec2u extends NumberArrayView {
  readonly kind: 'vec2u';
  x: number;
  y: number;
}

export interface vec3f extends NumberArrayView {
  readonly kind: 'vec3f';
  x: number;
  y: number;
  z: number;
}

export interface vec3i extends NumberArrayView {
  readonly kind: 'vec3i';
  x: number;
  y: number;
  z: number;
}

export interface vec3u extends NumberArrayView {
  readonly kind: 'vec3u';
  x: number;
  y: number;
  z: number;
}

export interface vec4f extends NumberArrayView {
  readonly kind: 'vec4f';
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface vec4i extends NumberArrayView {
  readonly kind: 'vec4i';
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface vec4u extends NumberArrayView {
  readonly kind: 'vec4u';
  x: number;
  y: number;
  z: number;
  w: number;
}

// #endregion

// #region WGSL Schema Types

export interface Bool {
  readonly type: 'bool';
  readonly __repr: boolean;
}

export interface F32 {
  readonly type: 'f32';
  readonly __repr: number;
}

export interface I32 {
  readonly type: 'i32';
  readonly __repr: number;
}

export interface U32 {
  readonly type: 'u32';
  readonly __repr: number;
}

export interface Vec3f {
  readonly type: 'vec3f';
  readonly __repr: vec3f;
}

export interface WgslStruct<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly type: 'struct';
  readonly size: number;
  readonly alignment: number;
  readonly label?: string | undefined;
  readonly propTypes: TProps;
  readonly __repr: InferRecord<TProps>;
}

export interface WgslArray<TElement = unknown> {
  readonly type: 'array';
  readonly size: number;
  readonly length: number;
  readonly alignment: number;
  readonly label?: string | undefined;
  readonly elementType: TElement;
  readonly __repr: Infer<TElement>[];
}

export type AnyWgslData =
  | Bool
  | F32
  | I32
  | U32
  | Vec3f
  | WgslStruct
  | WgslArray;

// #endregion

const knownSizesMap: Record<string, number> = {
  bool: 4,
  f32: 4,
  i32: 4,
  u32: 4,
  vec2f: 8,
  vec2i: 8,
  vec2u: 8,
  vec3f: 12,
  vec3i: 12,
  vec3u: 12,
  vec4f: 16,
  vec4i: 16,
  vec4u: 16,
};

const knownAlignmentMap: Record<string, number> = {
  bool: 4,
  f32: 4,
  i32: 4,
  u32: 4,
  vec2f: 8,
  vec2i: 8,
  vec2u: 8,
  vec3f: 16,
  vec3i: 16,
  vec3u: 16,
  vec4f: 16,
  vec4i: 16,
  vec4u: 16,
};

export function sizeOfData(data: unknown) {
  return (
    knownSizesMap[(data as AnyWgslData)?.type] ??
    (data as { size: number }).size ??
    Number.NaN
  );
}

export function alignmentOfData(data: unknown) {
  return (
    knownAlignmentMap[(data as AnyWgslData)?.type] ??
    (data as { alignment: number }).alignment ??
    0
  );
}

export function isWgslSchema(value: unknown): value is AnyWgslData {
  return typeof (value as AnyWgslData)?.type === 'string';
}

/**
 * Checks whether passed in value is an array schema,
 * as opposed to, e.g., a looseArray schema.
 *
 * Array schemas can be used to describe uniform and storage buffers,
 * whereas looseArray schemas cannot.
 *
 * @example
 * isArraySchema(d.arrayOf(d.u32, 4)) // true
 * isArraySchema(d.looseArrayOf(d.u32, 4)) // false
 * isArraySchema(d.vec3f) // false
 */
export function isArraySchema<T extends WgslArray<AnyWgslData>>(
  schema: T | unknown,
): schema is T {
  return (schema as WgslArray)?.type === 'array';
}
