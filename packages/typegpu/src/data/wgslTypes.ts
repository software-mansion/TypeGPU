// oxlint-disable-next-line no-unused-vars it is used
import type { Operator } from 'tsover-runtime';
import type { TgpuNamable } from '../shared/meta.ts';
import type {
  ExtractInvalidSchemaError,
  Infer,
  InferGPU,
  InferGPURecord,
  InferPartial,
  InferPartialRecord,
  InferRecord,
  IsValidStorageSchema,
  IsValidUniformSchema,
  IsValidVertexSchema,
  MemIdentity,
  MemIdentityRecord,
} from '../shared/repr.ts';
import type {
  $gpuRepr,
  $invalidSchemaReason,
  $memIdent,
  $repr,
  $reprPartial,
  $validStorageSchema,
  $validUniformSchema,
  $validVertexSchema,
} from '../shared/symbols.ts';
import { $internal, isMarkedInternal } from '../shared/symbols.ts';
import type { Prettify, SwapNever } from '../shared/utilityTypes.ts';
import type {
  WgslExternalTexture,
  WgslStorageTexture,
  WgslTexture,
} from './texture.ts';
import type { WgslComparisonSampler, WgslSampler } from './sampler.ts';
import type { _ref as ref } from './ref.ts';
import type { DualFn } from '../types.ts';

type DecoratedLocation<T extends BaseData> = Decorated<T, Location[]>;

export interface BaseData {
  readonly [$internal]: Record<string, unknown>;
  readonly type: string;
  readonly [$repr]: unknown;
  toString(): string;
}

export interface NumberArrayView {
  readonly length: number;
  [n: number]: number;
  [Symbol.iterator]: () => Iterator<number>;
}

/**
 * Vector infix notation.
 *
 * @privateRemarks
 * These functions are not defined on vectors,
 * but are instead assigned to `VecBase` after both `data` and `std` are initialized.
 */
export interface vecInfixNotation<T extends vecBase> {
  add(other: T | number): T;
  sub(other: T | number): T;
  mul(other: mBaseForVec<T> | T | number): T;
  div(other: T | number): T;
  mod(other: T | number): T;

  [Operator.plus](lhs: T | number, rhs: T | number): T;
  [Operator.minus](lhs: T | number, rhs: T | number): T;
  [Operator.star](
    lhs: mBaseForVec<T> | T | number,
    rhs: mBaseForVec<T> | T | number,
  ): T;
  [Operator.slash](lhs: T | number, rhs: T | number): T;
  [Operator.percent](lhs: T | number, rhs: T | number): T;
}

/**
 * Matrix infix notation.
 *
 * @privateRemarks
 * These functions are not defined on matrices,
 * but are instead assigned to `MatBase` after both `data` and `std` are initialized.
 */
export interface matInfixNotation<T extends matBase> {
  add(other: T): T;
  sub(other: T): T;
  mul(other: T | number): T;
  mul(other: vBaseForMat<T>): vBaseForMat<T>;

  [Operator.plus](lhs: T, rhs: T): T;
  [Operator.minus](lhs: T, rhs: T): T;
  [Operator.star](lhs: T | number, rhs: T | number): T;
  [Operator.star](lhs: T, rhs: vBaseForMat<T>): vBaseForMat<T>;
  [Operator.star](lhs: vBaseForMat<T>, rhs: T): vBaseForMat<T>;
}

/**
 * Represents a 64-bit integer.
 */
export interface AbstractInt extends BaseData {
  readonly type: 'abstractInt';
  // Type-tokens, not available at runtime
  readonly [$repr]: number;
  readonly [$invalidSchemaReason]: 'Abstract numerics are not host-shareable';
  // ---
}

/**
 * Represents a 64-bit IEEE 754 floating point number.
 */
export interface AbstractFloat extends BaseData {
  readonly type: 'abstractFloat';
  // Type-tokens, not available at runtime
  readonly [$repr]: number;
  readonly [$invalidSchemaReason]: 'Abstract numerics are not host-shareable';
  // ---
}

export interface Void extends BaseData {
  readonly type: 'void';
  // Type-tokens, not available at runtime
  readonly [$repr]: void;
  readonly [$invalidSchemaReason]: 'Void is not host-shareable';
  // ---
}
export const Void = {
  [$internal]: {},
  type: 'void',
  toString() {
    return 'void';
  },
} as Void;

// #region Instance Types

type XY = 'x' | 'y';
type XYZ = 'x' | 'y' | 'z';
type XYZW = 'x' | 'y' | 'z' | 'w';
type RG = 'r' | 'g';
type RGB = 'r' | 'g' | 'b';
type RGBA = 'r' | 'g' | 'b' | 'a';

type Swizzle2<T2, T3, T4> =
  & {
    readonly [K in `${XY}${XY}` | `${RG}${RG}`]: T2;
  }
  & {
    readonly [K in `${XY}${XY}${XY}` | `${RG}${RG}${RG}`]: T3;
  }
  & {
    readonly [
      K in `${XY}${XY}${XY}${XY}` | `${RG}${RG}${RG}${RG}`
    ]: T4;
  };

type Swizzle3<T2, T3, T4> =
  & {
    readonly [K in `${XYZ}${XYZ}` | `${RGB}${RGB}`]: T2;
  }
  & {
    readonly [K in `${XYZ}${XYZ}${XYZ}` | `${RGB}${RGB}${RGB}`]: T3;
  }
  & {
    readonly [
      K in `${XYZ}${XYZ}${XYZ}${XYZ}` | `${RGB}${RGB}${RGB}${RGB}`
    ]: T4;
  };

type Swizzle4<T2, T3, T4> =
  & {
    readonly [K in `${XYZW}${XYZW}` | `${RGBA}${RGBA}`]: T2;
  }
  & {
    readonly [K in `${XYZW}${XYZW}${XYZW}` | `${RGBA}${RGBA}${RGBA}`]: T3;
  }
  & {
    readonly [
      K in `${XYZW}${XYZW}${XYZW}${XYZW}` | `${RGBA}${RGBA}${RGBA}${RGBA}`
    ]: T4;
  };

type Tuple2<S> = [S, S];
type Tuple3<S> = [S, S, S];
type Tuple4<S> = [S, S, S, S];

export interface vecBase extends vecInfixNotation<vecBase> {
  readonly [$internal]: true;
}

/**
 * Interface representing its WGSL vector type counterpart: vec2f or vec2<f32>.
 * A vector with 2 elements of type f32
 */
export interface v2f
  extends Tuple2<number>, Swizzle2<v2f, v3f, v4f>, vecInfixNotation<v2f> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec2f';
  x: number;
  y: number;
  r: number;
  g: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec2h or vec2<f16>.
 * A vector with 2 elements of type f16
 */
export interface v2h
  extends Tuple2<number>, Swizzle2<v2h, v3h, v4h>, vecInfixNotation<v2h> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec2h';
  x: number;
  y: number;
  r: number;
  g: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec2i or vec2<i32>.
 * A vector with 2 elements of type i32
 */
export interface v2i
  extends Tuple2<number>, Swizzle2<v2i, v3i, v4i>, vecInfixNotation<v2i> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec2i';
  x: number;
  y: number;
  r: number;
  g: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec2u or vec2<u32>.
 * A vector with 2 elements of type u32
 */
export interface v2u
  extends Tuple2<number>, Swizzle2<v2u, v3u, v4u>, vecInfixNotation<v2u> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec2u';
  x: number;
  y: number;
  r: number;
  g: number;
}

/**
 * Interface representing its WGSL vector type counterpart: `vec2<bool>`.
 * A vector with 2 elements of type `bool`
 */
export interface v2b extends Tuple2<boolean>, Swizzle2<v2b, v3b, v4b> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec2<bool>';
  x: boolean;
  y: boolean;
  r: boolean;
  g: boolean;
}

/**
 * Interface representing its WGSL vector type counterpart: vec3f or vec3<f32>.
 * A vector with 3 elements of type f32
 */
export interface v3f
  extends Tuple3<number>, Swizzle3<v2f, v3f, v4f>, vecInfixNotation<v3f> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec3f';
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec3h or vec3<f16>.
 * A vector with 3 elements of type f16
 */
export interface v3h
  extends Tuple3<number>, Swizzle3<v2h, v3h, v4h>, vecInfixNotation<v3h> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec3h';
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec3i or vec3<i32>.
 * A vector with 3 elements of type i32
 */
export interface v3i
  extends Tuple3<number>, Swizzle3<v2i, v3i, v4i>, vecInfixNotation<v3i> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec3i';
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec3u or vec3<u32>.
 * A vector with 3 elements of type u32
 */
export interface v3u
  extends Tuple3<number>, Swizzle3<v2u, v3u, v4u>, vecInfixNotation<v3u> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec3u';
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
}

/**
 * Interface representing its WGSL vector type counterpart: `vec3<bool>`.
 * A vector with 3 elements of type `bool`
 */
export interface v3b extends Tuple3<boolean>, Swizzle3<v2b, v3b, v4b> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec3<bool>';
  x: boolean;
  y: boolean;
  z: boolean;
  r: boolean;
  g: boolean;
  b: boolean;
}

/**
 * Interface representing its WGSL vector type counterpart: vec4f or vec4<f32>.
 * A vector with 4 elements of type f32
 */
export interface v4f
  extends Tuple4<number>, Swizzle4<v2f, v3f, v4f>, vecInfixNotation<v4f> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec4f';
  x: number;
  y: number;
  z: number;
  w: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec4h or vec4<f16>.
 * A vector with 4 elements of type f16
 */
export interface v4h
  extends Tuple4<number>, Swizzle4<v2h, v3h, v4h>, vecInfixNotation<v4h> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec4h';
  x: number;
  y: number;
  z: number;
  w: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec4i or vec4<i32>.
 * A vector with 4 elements of type i32
 */
export interface v4i
  extends Tuple4<number>, Swizzle4<v2i, v3i, v4i>, vecInfixNotation<v4i> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec4i';
  x: number;
  y: number;
  z: number;
  w: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec4u or vec4<u32>.
 * A vector with 4 elements of type u32
 */
export interface v4u
  extends Tuple4<number>, Swizzle4<v2u, v3u, v4u>, vecInfixNotation<v4u> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec4u';
  x: number;
  y: number;
  z: number;
  w: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Interface representing its WGSL vector type counterpart: `vec4<bool>`.
 * A vector with 4 elements of type `bool`
 */
export interface v4b extends Tuple4<boolean>, Swizzle4<v2b, v3b, v4b> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec4<bool>';
  x: boolean;
  y: boolean;
  z: boolean;
  w: boolean;
  r: boolean;
  g: boolean;
  b: boolean;
  a: boolean;
}

export type AnyFloat32VecInstance = v2f | v3f | v4f;

export type AnyFloat16VecInstance = v2h | v3h | v4h;

export type AnyFloatVecInstance = v2f | v2h | v3f | v3h | v4f | v4h;

export type AnyUnsignedVecInstance = v2u | v3u | v4u;

export type AnyIntegerVecInstance = v2i | v2u | v3i | v3u | v4i | v4u;

export type AnyBooleanVecInstance = v2b | v3b | v4b;

export type AnySignedVecInstance =
  | v2i
  | v2f
  | v2h
  | v3i
  | v3f
  | v3h
  | v4i
  | v4f
  | v4h;

export type AnyNumericVec2Instance = v2f | v2h | v2i | v2u;
export type AnyNumericVec3Instance = v3f | v3h | v3i | v3u;
export type AnyNumericVec4Instance = v4f | v4h | v4i | v4u;

export type AnyNumericVecInstance =
  | AnyNumericVec2Instance
  | AnyNumericVec3Instance
  | AnyNumericVec4Instance;

export type AnyVec2Instance = v2f | v2h | v2i | v2u | v2b;
export type AnyVec3Instance = v3f | v3h | v3i | v3u | v3b;
export type AnyVec4Instance = v4f | v4h | v4i | v4u | v4b;

export type AnyVecInstance =
  | AnyVec2Instance
  | AnyVec3Instance
  | AnyVec4Instance;

export type VecKind = AnyVecInstance['kind'];

export interface matBase extends matInfixNotation<matBase> {
  readonly [$internal]: true;
}

/**
 * Interface representing its WGSL matrix type counterpart: mat2x2
 * A matrix with 2 rows and 2 columns, with elements of type `TColumn`
 */
export interface mat2x2<TColumn> extends NumberArrayView {
  readonly [$internal]: true;
  readonly length: 4;
  readonly kind: string;
  /* override */ readonly columns: readonly [TColumn, TColumn];
  [n: number]: number;
}

/**
 * Interface representing its WGSL matrix type counterpart: mat2x2f or mat2x2<f32>
 * A matrix with 2 rows and 2 columns, with elements of type d.f32
 */
export interface m2x2f extends mat2x2<v2f>, matInfixNotation<m2x2f> {
  readonly kind: 'mat2x2f';
}

/**
 * Interface representing its WGSL matrix type counterpart: mat3x3
 * A matrix with 3 rows and 3 columns, with elements of type `TColumn`
 */
export interface mat3x3<TColumn> extends NumberArrayView {
  readonly [$internal]: true;
  readonly length: 12;
  readonly kind: string;
  /* override */ readonly columns: readonly [TColumn, TColumn, TColumn];
  [n: number]: number;
}

/**
 * Interface representing its WGSL matrix type counterpart: mat3x3f or mat3x3<f32>
 * A matrix with 3 rows and 3 columns, with elements of type d.f32
 */
export interface m3x3f extends mat3x3<v3f>, matInfixNotation<m3x3f> {
  readonly kind: 'mat3x3f';
}

/**
 * Interface representing its WGSL matrix type counterpart: mat4x4
 * A matrix with 4 rows and 4 columns, with elements of type `TColumn`
 */
export interface mat4x4<TColumn> extends NumberArrayView {
  readonly [$internal]: true;
  readonly length: 16;
  readonly kind: string;
  /* override */ readonly columns: readonly [
    TColumn,
    TColumn,
    TColumn,
    TColumn,
  ];
  [n: number]: number;
}

/**
 * Interface representing its WGSL matrix type counterpart: mat4x4f or mat4x4<f32>
 * A matrix with 4 rows and 4 columns, with elements of type d.f32
 */
export interface m4x4f extends mat4x4<v4f>, matInfixNotation<m4x4f> {
  readonly kind: 'mat4x4f';
}

export type AnyMatInstance = m2x2f | m3x3f | m4x4f;

export type vBaseForMat<T extends matBase> = T extends m2x2f ? v2f
  : T extends m3x3f ? v3f
  : T extends m4x4f ? v4f
  : vecBase;

export type mBaseForVec<T extends vecBase> = T extends v2f ? m2x2f
  : T extends v3f ? m3x3f
  : T extends v4f ? m4x4f
  : matBase;

// #endregion

// #region WGSL Schema Types
/**
 * Boolean schema representing a single WGSL bool value.
 * Cannot be used inside buffers as it is not host-shareable.
 */
export interface Bool
  extends BaseData, DualFn<(v?: number | boolean) => boolean> {
  readonly type: 'bool';

  // Type-tokens, not available at runtime
  readonly [$repr]: boolean;
  readonly [$invalidSchemaReason]:
    'Bool is not host-shareable, use U32 or I32 instead';
  // ---
}

/**
 * 32-bit float schema representing a single WGSL f32 value.
 */
export interface F32
  extends BaseData, DualFn<(v?: number | boolean) => number> {
  readonly type: 'f32';

  // Type-tokens, not available at runtime
  readonly [$repr]: number;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * 16-bit float schema representing a single WGSL f16 value.
 */
export interface F16
  extends BaseData, DualFn<(v?: number | boolean) => number> {
  readonly type: 'f16';

  // Type-tokens, not available at runtime
  readonly [$repr]: number;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Signed 32-bit integer schema representing a single WGSL i32 value.
 */
export interface I32
  extends BaseData, DualFn<(v?: number | boolean) => number> {
  readonly type: 'i32';

  // Type-tokens, not available at runtime
  readonly [$repr]: number;
  readonly [$memIdent]: I32 | Atomic<I32> | DecoratedLocation<I32>;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Unsigned 32-bit integer schema representing a single WGSL u32 value.
 */
export interface U32
  extends BaseData, DualFn<(v?: number | boolean) => number> {
  readonly type: 'u32';

  // Type-tokens, not available at runtime
  readonly [$repr]: number;
  readonly [$memIdent]: U32 | Atomic<U32> | DecoratedLocation<U32>;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Unsigned 16-bit integer schema used exclusively for index buffer schemas.
 */
export interface U16 extends BaseData {
  readonly type: 'u16';

  // Type-tokens, not available at runtime
  readonly [$repr]: number;
  readonly [$invalidSchemaReason]:
    'U16 is only usable inside arrays for index buffers, use U32 or I32 instead';
  // ---
}

/**
 * Type of the `d.vec2f` object/function: vector data type schema/constructor
 */
export interface Vec2f extends
  BaseData,
  DualFn<
    & ((x: number, y: number) => v2f)
    & ((xy: number) => v2f)
    & (() => v2f)
    & ((v: AnyNumericVec2Instance) => v2f)
  > {
  readonly type: 'vec2f';
  readonly primitive: F32;
  readonly componentCount: 2;

  // Type-tokens, not available at runtime
  readonly [$repr]: v2f;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Type of the `d.vec2h` object/function: vector data type schema/constructor
 */
export interface Vec2h extends
  BaseData,
  DualFn<
    & ((x: number, y: number) => v2h)
    & ((xy: number) => v2h)
    & (() => v2h)
    & ((v: AnyNumericVec2Instance) => v2h)
  > {
  readonly type: 'vec2h';
  readonly primitive: F16;
  readonly componentCount: 2;

  // Type-tokens, not available at runtime
  readonly [$repr]: v2h;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Type of the `d.vec2i` object/function: vector data type schema/constructor
 */
export interface Vec2i extends
  BaseData,
  DualFn<
    & ((x: number, y: number) => v2i)
    & ((xy: number) => v2i)
    & (() => v2i)
    & ((v: AnyNumericVec2Instance) => v2i)
  > {
  readonly type: 'vec2i';
  readonly primitive: I32;
  readonly componentCount: 2;

  // Type-tokens, not available at runtime
  readonly [$repr]: v2i;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Type of the `d.vec2u` object/function: vector data type schema/constructor
 */
export interface Vec2u extends
  BaseData,
  DualFn<
    & ((x: number, y: number) => v2u)
    & ((xy: number) => v2u)
    & (() => v2u)
    & ((v: AnyNumericVec2Instance) => v2u)
  > {
  readonly type: 'vec2u';
  readonly primitive: U32;
  readonly componentCount: 2;

  // Type-tokens, not available at runtime
  readonly [$repr]: v2u;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Type of the `d.vec2b` object/function: vector data type schema/constructor
 * Cannot be used inside buffers as it is not host-shareable.
 */
export interface Vec2b extends
  BaseData,
  DualFn<
    & ((x: boolean, y: boolean) => v2b)
    & ((xy: boolean) => v2b)
    & (() => v2b)
    & ((v: v2b) => v2b)
  > {
  readonly type: 'vec2<bool>';
  readonly primitive: Bool;
  readonly componentCount: 2;

  // Type-tokens, not available at runtime
  readonly [$repr]: v2b;
  readonly [$invalidSchemaReason]:
    'Boolean vectors is not host-shareable, use numeric vectors instead';
  // ---
}

/**
 * Type of the `d.vec3f` object/function: vector data type schema/constructor
 */
export interface Vec3f extends
  BaseData,
  DualFn<
    & ((x: number, y: number, z: number) => v3f)
    & ((xyz: number) => v3f)
    & (() => v3f)
    & ((v: AnyNumericVec3Instance) => v3f)
    & ((v0: AnyNumericVec2Instance, z: number) => v3f)
    & ((x: number, v0: AnyNumericVec2Instance) => v3f)
  > {
  readonly type: 'vec3f';
  readonly primitive: F32;
  readonly componentCount: 3;

  // Type-tokens, not available at runtime
  readonly [$repr]: v3f;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Type of the `d.vec3h` object/function: vector data type schema/constructor
 */
export interface Vec3h extends
  BaseData,
  DualFn<
    & ((x: number, y: number, z: number) => v3h)
    & ((xyz: number) => v3h)
    & (() => v3h)
    & ((v: AnyNumericVec3Instance) => v3h)
    & ((v0: AnyNumericVec2Instance, z: number) => v3h)
    & ((x: number, v0: AnyNumericVec2Instance) => v3h)
  > {
  readonly type: 'vec3h';
  readonly primitive: F16;
  readonly componentCount: 3;

  // Type-tokens, not available at runtime
  readonly [$repr]: v3h;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Type of the `d.vec3i` object/function: vector data type schema/constructor
 */
export interface Vec3i extends
  BaseData,
  DualFn<
    & ((x: number, y: number, z: number) => v3i)
    & ((xyz: number) => v3i)
    & (() => v3i)
    & ((v: AnyNumericVec3Instance) => v3i)
    & ((v0: AnyNumericVec2Instance, z: number) => v3i)
    & ((x: number, v0: AnyNumericVec2Instance) => v3i)
  > {
  readonly type: 'vec3i';
  readonly primitive: I32;
  readonly componentCount: 3;

  // Type-tokens, not available at runtime
  readonly [$repr]: v3i;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Type of the `d.vec3u` object/function: vector data type schema/constructor
 */
export interface Vec3u extends
  BaseData,
  DualFn<
    & ((x: number, y: number, z: number) => v3u)
    & ((xyz: number) => v3u)
    & (() => v3u)
    & ((v: AnyNumericVec3Instance) => v3u)
    & ((v0: AnyNumericVec2Instance, z: number) => v3u)
    & ((x: number, v0: AnyNumericVec2Instance) => v3u)
  > {
  readonly type: 'vec3u';
  readonly primitive: U32;
  readonly componentCount: 3;

  // Type-tokens, not available at runtime
  readonly [$repr]: v3u;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Type of the `d.vec3b` object/function: vector data type schema/constructor
 * Cannot be used inside buffers as it is not host-shareable.
 */
export interface Vec3b extends
  BaseData,
  DualFn<
    & ((x: boolean, y: boolean, z: boolean) => v3b)
    & ((xyz: boolean) => v3b)
    & (() => v3b)
    & ((v: v3b) => v3b)
    & ((v0: v2b, z: boolean) => v3b)
    & ((x: boolean, v0: v2b) => v3b)
  > {
  readonly type: 'vec3<bool>';
  readonly primitive: Bool;
  readonly componentCount: 3;

  // Type-tokens, not available at runtime
  readonly [$repr]: v3b;
  readonly [$invalidSchemaReason]:
    'Boolean vectors is not host-shareable, use numeric vectors instead';
  // ---
}

/**
 * Type of the `d.vec4f` object/function: vector data type schema/constructor
 */
export interface Vec4f extends
  BaseData,
  DualFn<
    & ((x: number, y: number, z: number, w: number) => v4f)
    & ((xyzw: number) => v4f)
    & (() => v4f)
    & ((v: AnyNumericVec4Instance) => v4f)
    & ((v0: AnyNumericVec3Instance, w: number) => v4f)
    & ((x: number, v0: AnyNumericVec3Instance) => v4f)
    & ((v0: AnyNumericVec2Instance, v1: AnyNumericVec2Instance) => v4f)
    & ((v0: AnyNumericVec2Instance, z: number, w: number) => v4f)
    & ((x: number, v0: AnyNumericVec2Instance, z: number) => v4f)
    & ((x: number, y: number, v0: AnyNumericVec2Instance) => v4f)
  > {
  readonly type: 'vec4f';
  readonly primitive: F32;
  readonly componentCount: 4;

  // Type-tokens, not available at runtime
  readonly [$repr]: v4f;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Type of the `d.vec4h` object/function: vector data type schema/constructor
 */
export interface Vec4h extends
  BaseData,
  DualFn<
    & ((x: number, y: number, z: number, w: number) => v4h)
    & ((xyzw: number) => v4h)
    & (() => v4h)
    & ((v: AnyNumericVec4Instance) => v4h)
    & ((v0: AnyNumericVec3Instance, w: number) => v4h)
    & ((x: number, v0: AnyNumericVec3Instance) => v4h)
    & ((v0: AnyNumericVec2Instance, v1: AnyNumericVec2Instance) => v4h)
    & ((v0: AnyNumericVec2Instance, z: number, w: number) => v4h)
    & ((x: number, v0: AnyNumericVec2Instance, z: number) => v4h)
    & ((x: number, y: number, v0: AnyNumericVec2Instance) => v4h)
  > {
  readonly type: 'vec4h';
  readonly primitive: F16;
  readonly componentCount: 4;

  // Type-tokens, not available at runtime
  readonly [$repr]: v4h;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Type of the `d.vec4i` object/function: vector data type schema/constructor
 */
export interface Vec4i extends
  BaseData,
  DualFn<
    & ((x: number, y: number, z: number, w: number) => v4i)
    & ((xyzw: number) => v4i)
    & (() => v4i)
    & ((v: AnyNumericVec4Instance) => v4i)
    & ((v0: AnyNumericVec3Instance, w: number) => v4i)
    & ((x: number, v0: AnyNumericVec3Instance) => v4i)
    & ((v0: AnyNumericVec2Instance, v1: AnyNumericVec2Instance) => v4i)
    & ((v0: AnyNumericVec2Instance, z: number, w: number) => v4i)
    & ((x: number, v0: AnyNumericVec2Instance, z: number) => v4i)
    & ((x: number, y: number, v0: AnyNumericVec2Instance) => v4i)
  > {
  readonly type: 'vec4i';
  readonly primitive: I32;
  readonly componentCount: 4;

  // Type-tokens, not available at runtime
  readonly [$repr]: v4i;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Type of the `d.vec4u` object/function: vector data type schema/constructor
 */
export interface Vec4u extends
  BaseData,
  DualFn<
    & ((x: number, y: number, z: number, w: number) => v4u)
    & ((xyzw: number) => v4u)
    & (() => v4u)
    & ((v: AnyNumericVec4Instance) => v4u)
    & ((v0: AnyNumericVec3Instance, w: number) => v4u)
    & ((x: number, v0: AnyNumericVec3Instance) => v4u)
    & ((v0: AnyNumericVec2Instance, v1: AnyNumericVec2Instance) => v4u)
    & ((v0: AnyNumericVec2Instance, z: number, w: number) => v4u)
    & ((x: number, v0: AnyNumericVec2Instance, z: number) => v4u)
    & ((x: number, y: number, v0: AnyNumericVec2Instance) => v4u)
  > {
  readonly type: 'vec4u';
  readonly primitive: U32;
  readonly componentCount: 4;

  // Type-tokens, not available at runtime
  readonly [$repr]: v4u;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

/**
 * Type of the `d.vec4b` object/function: vector data type schema/constructor
 * Cannot be used inside buffers as it is not host-shareable.
 */
export interface Vec4b extends
  BaseData,
  DualFn<
    & ((x: boolean, y: boolean, z: boolean, w: boolean) => v4b)
    & ((xyzw: boolean) => v4b)
    & (() => v4b)
    & ((v: v4b) => v4b)
    & ((v0: v3b, w: boolean) => v4b)
    & ((x: boolean, v0: v3b) => v4b)
    & ((v0: v2b, v1: v2b) => v4b)
    & ((v0: v2b, z: boolean, w: boolean) => v4b)
    & ((x: boolean, v0: v2b, z: boolean) => v4b)
    & ((x: boolean, y: boolean, v0: v2b) => v4b)
  > {
  readonly type: 'vec4<bool>';
  readonly primitive: Bool;
  readonly componentCount: 4;

  // Type-tokens, not available at runtime
  readonly [$repr]: v4b;
  readonly [$invalidSchemaReason]:
    'Boolean vectors is not host-shareable, use numeric vectors instead';
  // ---
}

/**
 * Type of the `d.mat2x2f` object/function: matrix data type schema/constructor
 */
export interface Mat2x2f extends BaseData {
  readonly type: 'mat2x2f';
  readonly primitive: F32;

  // Type-tokens, not available at runtime
  readonly [$repr]: m2x2f;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  // ---

  (...elements: [number, number, number, number]): m2x2f;
  (...columns: [v2f, v2f]): m2x2f;
  (): m2x2f;
  identity(): m2x2f;
}

/**
 * Type of the `d.mat3x3f` object/function: matrix data type schema/constructor
 */
export interface Mat3x3f extends BaseData {
  readonly type: 'mat3x3f';
  readonly primitive: F32;

  // Type-tokens, not available at runtime
  readonly [$repr]: m3x3f;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  // ---

  // deno-fmt-ignore
  (...elements: [number, number, number, number, number, number, number, number, number]): m3x3f;
  (...columns: [v3f, v3f, v3f]): m3x3f;
  (): m3x3f;
  identity(): m3x3f;
}

/**
 * Type of the `d.mat4x4f` object/function: matrix data type schema/constructor
 */
export interface Mat4x4f extends BaseData {
  readonly type: 'mat4x4f';
  readonly primitive: F32;

  // Type-tokens, not available at runtime
  readonly [$repr]: m4x4f;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  // ---

  // deno-fmt-ignore
  (...elements: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]): m4x4f;
  (...columns: [v4f, v4f, v4f, v4f]): m4x4f;
  (): m4x4f;
  identity(): m4x4f;
  translation(vec: v3f): m4x4f;
  scaling(vec: v3f): m4x4f;
  rotationX(angle: number): m4x4f;
  rotationY(angle: number): m4x4f;
  rotationZ(angle: number): m4x4f;
}

/**
 * Array schema constructed via `d.arrayOf` function.
 *
 * Responsible for handling reading and writing array values
 * between binary and JS representation. Takes into account
 * the `byteAlignment` requirement of its elementType.
 */
// We restrict the element type to being BaseData, which is the widest type
// we can use internally to work with generic arrays. The default type of
// `AnyWgslData` is the best choice for end-users.
export interface WgslArray<out TElement extends BaseData = BaseData>
  extends BaseData {
  <T extends TElement>(elements: Infer<T>[]): Infer<T>[];
  (): Infer<TElement>[];
  readonly type: 'array';
  readonly elementCount: number;
  readonly elementType: TElement;

  // Type-tokens, not available at runtime
  readonly [$repr]: Infer<TElement>[];
  readonly [$gpuRepr]: InferGPU<TElement>[];
  readonly [$reprPartial]:
    | { idx: number; value: InferPartial<TElement> }[]
    | undefined;
  readonly [$memIdent]: WgslArray<MemIdentity<TElement>>;
  readonly [$validStorageSchema]: IsValidStorageSchema<TElement>;
  readonly [$validUniformSchema]: IsValidUniformSchema<TElement>;
  readonly [$validVertexSchema]: IsValidVertexSchema<TElement>;
  readonly [$invalidSchemaReason]:
    `in array element — ${ExtractInvalidSchemaError<TElement>}`;
  // ---
}

/**
 * Struct schema constructed via `d.struct` function.
 *
 * Responsible for handling reading and writing struct values
 * between binary and JS representation. Takes into account
 * the `byteAlignment` requirement of its members.
 */
export interface WgslStruct<
  // We restrict the type to being Record<string, BaseData>, which is the widest type
  // we can use internally to work with generic structs.
  // @ts-expect-error: Override variance, as we want structs to behave like objects
  out TProps extends Record<string, BaseData> = Record<string, BaseData>,
> extends BaseData, TgpuNamable {
  readonly [$internal]: {
    isAbstruct: boolean;
  };
  readonly type: 'struct';
  readonly propTypes: TProps;

  (props: Prettify<InferRecord<TProps>>): Prettify<InferRecord<TProps>>;
  (): Prettify<InferRecord<TProps>>;

  // Type-tokens, not available at runtime
  readonly [$repr]: Prettify<InferRecord<TProps>>;
  readonly [$gpuRepr]: Prettify<InferGPURecord<TProps>>;
  readonly [$memIdent]: WgslStruct<Prettify<MemIdentityRecord<TProps>>>;
  readonly [$reprPartial]:
    | Prettify<Partial<InferPartialRecord<TProps>>>
    | undefined;
  readonly [$invalidSchemaReason]: SwapNever<
    {
      [K in keyof TProps]: ExtractInvalidSchemaError<
        TProps[K],
        `in struct property '${K & string}' — `
      >;
    }[keyof TProps],
    undefined
  >;
  readonly [$validStorageSchema]: {
    [K in keyof TProps]: IsValidStorageSchema<TProps[K]>;
  }[keyof TProps] extends true ? true : false;
  readonly [$validUniformSchema]: {
    [K in keyof TProps]: IsValidUniformSchema<TProps[K]>;
  }[keyof TProps] extends true ? true : false;
  readonly [$validVertexSchema]: {
    [K in keyof TProps]: IsValidVertexSchema<TProps[K]>;
  }[keyof TProps] extends true ? true : false;
  // ---
}

/** @deprecated Just use `WgslStruct` without any type parameters */
export type AnyWgslStruct = WgslStruct;

export type AddressSpace =
  | 'uniform'
  | 'storage'
  | 'workgroup'
  | 'private'
  | 'function'
  | 'handle';
export type Access = 'read' | 'write' | 'read-write';

export interface Ptr<
  TAddr extends AddressSpace = AddressSpace,
  TInner extends BaseData = BaseData,
  TAccess extends Access = Access,
> extends BaseData {
  readonly type: 'ptr';
  readonly inner: TInner;
  readonly addressSpace: TAddr;
  readonly access: TAccess;
  readonly implicit: boolean;

  // Type-tokens, not available at runtime
  readonly [$repr]: ref<Infer<TInner>>;
  readonly [$invalidSchemaReason]: 'Pointers are not host-shareable';
  // ---
}

/**
 * Schema representing the `atomic<...>` WGSL data type.
 */
export interface Atomic<TInner extends U32 | I32 = U32 | I32> extends BaseData {
  readonly type: 'atomic';
  readonly inner: TInner;

  // Type-tokens, not available at runtime
  readonly [$repr]: Infer<TInner>;
  readonly [$gpuRepr]: TInner extends U32 ? atomicU32 : atomicI32;
  readonly [$memIdent]: MemIdentity<TInner>;
  readonly [$validStorageSchema]: true;
  readonly [$validUniformSchema]: true;
  readonly [$validVertexSchema]: true;
  // ---
}

export interface atomicU32 {
  readonly [$internal]: true;
  readonly type: 'atomicU32';
}

export interface atomicI32 {
  readonly [$internal]: true;
  readonly type: 'atomicI32';
}

export interface Align<T extends number> {
  readonly [$internal]: true;
  readonly type: '@align';
  readonly params: [T];
}

export interface Size<T extends number> {
  readonly [$internal]: true;
  readonly type: '@size';
  readonly params: [T];
}

export interface Location<T extends number = number> {
  readonly [$internal]: true;
  readonly type: '@location';
  readonly params: [T];
}

export type PerspectiveOrLinearInterpolationType = `${
  | 'perspective'
  | 'linear'}${'' | ', center' | ', centroid' | ', sample'}`;
export type FlatInterpolationType = `flat${'' | ', first' | ', either'}`;
export type InterpolationType =
  | PerspectiveOrLinearInterpolationType
  | FlatInterpolationType;

export interface Interpolate<T extends InterpolationType = InterpolationType> {
  readonly [$internal]: true;
  readonly type: '@interpolate';
  readonly params: [T];
}

export interface Builtin<T extends string> {
  readonly [$internal]: true;
  readonly type: '@builtin';
  readonly params: [T];
}

export interface Invariant {
  readonly [$internal]: true;
  readonly type: '@invariant';
  readonly params: [];
}

export interface Decorated<
  out TInner extends BaseData = BaseData,
  out TAttribs extends unknown[] = unknown[],
> extends BaseData {
  readonly type: 'decorated';
  readonly inner: TInner;
  readonly attribs: TAttribs;

  // Type-tokens, not available at runtime
  readonly [$repr]: Infer<TInner>;
  readonly [$gpuRepr]: InferGPU<TInner>;
  readonly [$reprPartial]: InferPartial<TInner>;
  readonly [$memIdent]: TAttribs extends Location[]
    ? MemIdentity<TInner> | Decorated<MemIdentity<TInner>, TAttribs>
    : Decorated<MemIdentity<TInner>, TAttribs>;
  readonly [$validStorageSchema]: IsValidStorageSchema<TInner>;
  readonly [$validUniformSchema]: IsValidUniformSchema<TInner>;
  readonly [$validVertexSchema]: IsValidVertexSchema<TInner>;
  readonly [$invalidSchemaReason]: ExtractInvalidSchemaError<TInner>;
  // ---
}

export const wgslTypeLiterals = [
  'bool',
  'f32',
  'f16',
  'i32',
  'u32',
  'u16',
  'vec2f',
  'vec2h',
  'vec2i',
  'vec2u',
  'vec2<bool>',
  'vec3f',
  'vec3h',
  'vec3i',
  'vec3u',
  'vec3<bool>',
  'vec4f',
  'vec4h',
  'vec4i',
  'vec4u',
  'vec4<bool>',
  'mat2x2f',
  'mat3x3f',
  'mat4x4f',
  'struct',
  'array',
  'ptr',
  'atomic',
  'decorated',
  'abstractInt',
  'abstractFloat',
  'void',
  'texture_1d',
  'texture_storage_1d',
  'texture_2d',
  'texture_storage_2d',
  'texture_multisampled_2d',
  'texture_depth_2d',
  'texture_depth_multisampled_2d',
  'texture_2d_array',
  'texture_storage_2d_array',
  'texture_depth_2d_array',
  'texture_cube',
  'texture_depth_cube',
  'texture_cube_array',
  'texture_depth_cube_array',
  'texture_3d',
  'texture_storage_3d',
  'texture_external',
  'sampler',
  'sampler_comparison',
] as const;

export type WgslTypeLiteral = (typeof wgslTypeLiterals)[number];
export type IsWgslData<T> = T extends { readonly type: WgslTypeLiteral } ? true
  : false;

export type PerspectiveOrLinearInterpolatableBaseType =
  | F32
  | F16
  | Vec2f
  | Vec2h
  | Vec3f
  | Vec3h
  | Vec4f
  | Vec4h;

export type PerspectiveOrLinearInterpolatableData =
  | PerspectiveOrLinearInterpolatableBaseType
  | Decorated<PerspectiveOrLinearInterpolatableBaseType>;

export type FlatInterpolatableAdditionalBaseType =
  | I32
  | U32
  | Vec2i
  | Vec2u
  | Vec3i
  | Vec3u
  | Vec4i
  | Vec4u;

export type FlatInterpolatableData =
  | PerspectiveOrLinearInterpolatableData
  | FlatInterpolatableAdditionalBaseType
  | Decorated<FlatInterpolatableAdditionalBaseType>;

export type TextureSampleTypes =
  | F32
  | I32
  | U32;

export type ScalarData =
  | Bool
  | F32
  | F16
  | I32
  | U32
  | AbstractInt
  | AbstractFloat;

export type VecData =
  | Vec2f
  | Vec2h
  | Vec2i
  | Vec2u
  | Vec2b
  | Vec3f
  | Vec3h
  | Vec3i
  | Vec3u
  | Vec3b
  | Vec4f
  | Vec4h
  | Vec4i
  | Vec4u
  | Vec4b;

export type MatData =
  | Mat2x2f
  | Mat3x3f
  | Mat4x4f;

export type StorableData =
  | ScalarData
  | VecData
  | MatData
  | Atomic<I32>
  | Atomic<U32>
  | WgslArray
  | WgslStruct;

export type AnyFloat32VecData = Vec2f | Vec3f | Vec4f;

export type AnyFloat16VecData = Vec2h | Vec3h | Vec4h;

export type AnyWgslData =
  | Bool
  | F32
  | F16
  | I32
  | U32
  | U16
  | Vec2f
  | Vec2h
  | Vec2i
  | Vec2u
  | Vec2b
  | Vec3f
  | Vec3h
  | Vec3i
  | Vec3u
  | Vec3b
  | Vec4f
  | Vec4h
  | Vec4i
  | Vec4u
  | Vec4b
  | Mat2x2f
  | Mat3x3f
  | Mat4x4f
  | WgslStruct
  | WgslArray
  | Ptr
  | Atomic<U32>
  | Atomic<I32>
  | Decorated
  | AbstractInt
  | AbstractFloat
  | Void
  | WgslTexture
  | WgslStorageTexture
  | WgslExternalTexture
  | WgslSampler
  | WgslComparisonSampler;

// #endregion

export function isVecInstance(value: unknown): value is AnyVecInstance {
  const v = value as AnyVecInstance | undefined;
  return isMarkedInternal(v) &&
    typeof v.kind === 'string' &&
    v.kind.startsWith('vec');
}

export function isVec2(value: unknown): value is Vec2f | Vec2h | Vec2i | Vec2u {
  const v = value as AnyWgslData | undefined;
  return isMarkedInternal(v) &&
    typeof v.type === 'string' &&
    v.type.startsWith('vec2');
}

export function isVec3(value: unknown): value is Vec3f | Vec3h | Vec3i | Vec3u {
  const v = value as AnyWgslData | undefined;
  return isMarkedInternal(v) &&
    typeof v.type === 'string' &&
    v.type.startsWith('vec3');
}

export function isVec4(value: unknown): value is Vec4f | Vec4h | Vec4i | Vec4u {
  const v = value as AnyWgslData | undefined;
  return isMarkedInternal(v) &&
    typeof v.type === 'string' &&
    v.type.startsWith('vec4');
}

export function isVec(
  value: unknown,
): value is
  | Vec2f
  | Vec2h
  | Vec2i
  | Vec2u
  | Vec2b
  | Vec3f
  | Vec3h
  | Vec3i
  | Vec3u
  | Vec3b
  | Vec4f
  | Vec4h
  | Vec4i
  | Vec4u
  | Vec4b {
  return isVec2(value) || isVec3(value) || isVec4(value);
}

export function isVecBool(
  value: unknown,
): value is
  | Vec2b
  | Vec3b
  | Vec4b {
  return isVec(value) && value.type.includes('b');
}

export function isMatInstance(value: unknown): value is AnyMatInstance {
  const v = value as AnyMatInstance | undefined;
  return isMarkedInternal(v) &&
    typeof v.kind?.startsWith === 'function' &&
    v.kind.startsWith('mat');
}

export function isMat2x2f(value: unknown): value is Mat2x2f {
  return (
    isMarkedInternal(value) &&
    (value as AnyWgslData)?.type === 'mat2x2f'
  );
}

export function isMat3x3f(value: unknown): value is Mat3x3f {
  return (
    isMarkedInternal(value) &&
    (value as AnyWgslData)?.type === 'mat3x3f'
  );
}

export function isMat4x4f(value: unknown): value is Mat4x4f {
  return (
    isMarkedInternal(value) &&
    (value as AnyWgslData)?.type === 'mat4x4f'
  );
}

export function isMat(value: unknown): value is Mat2x2f | Mat3x3f | Mat4x4f {
  return isMat2x2f(value) || isMat3x3f(value) || isMat4x4f(value);
}

export function isFloat32VecInstance(
  element: number | AnyVecInstance | AnyMatInstance,
): element is AnyFloat32VecInstance {
  return isVecInstance(element) &&
    ['vec2f', 'vec3f', 'vec4f'].includes(element.kind);
}

export function isWgslData(value: unknown): value is AnyWgslData {
  return (
    isMarkedInternal(value) &&
    wgslTypeLiterals.includes((value as AnyWgslData)?.type)
  );
}

/**
 * Checks whether passed in value is an array schema,
 * as opposed to, e.g., a disarray schema.
 *
 * Array schemas can be used to describe uniform and storage buffers,
 * whereas disarray schemas cannot.
 *
 * @example
 * isWgslArray(d.arrayOf(d.u32, 4)) // true
 * isWgslArray(d.disarray(d.u32, 4)) // false
 * isWgslArray(d.vec3f) // false
 */
export function isWgslArray(schema: unknown): schema is WgslArray {
  return isMarkedInternal(schema) && (schema as WgslArray)?.type === 'array';
}

/**
 * Checks whether passed in value is a struct schema,
 * as opposed to, e.g., an unstruct schema.
 *
 * Struct schemas can be used to describe uniform and storage buffers,
 * whereas unstruct schemas cannot.
 *
 * @example
 * isWgslStruct(d.struct({ a: d.u32 })) // true
 * isWgslStruct(d.unstruct({ a: d.u32 })) // false
 * isWgslStruct(d.vec3f) // false
 */
export function isWgslStruct(
  schema: unknown,
): schema is WgslStruct {
  return isMarkedInternal(schema) && (schema as WgslStruct)?.type === 'struct';
}

/**
 * Checks whether passed in value is a pointer schema.
 *
 * @example
 * isPtr(d.ptrFn(d.f32)) // true
 * isPtr(d.ptrPrivate(d.f32)) // true
 * isPtr(d.f32) // false
 */
export function isPtr(schema: unknown): schema is Ptr {
  return isMarkedInternal(schema) && (schema as Ptr)?.type === 'ptr';
}

/**
 * Checks whether the passed in value is an atomic schema.
 *
 * @example
 * isAtomic(d.atomic(d.u32)) // true
 * isAtomic(d.u32) // false
 */
export function isAtomic(schema: unknown): schema is Atomic {
  return isMarkedInternal(schema) && (schema as Atomic)?.type === 'atomic';
}

export function isAlignAttrib<T extends number>(
  value: unknown,
): value is Align<T> {
  return isMarkedInternal(value) && (value as Align<T>)?.type === '@align';
}

export function isSizeAttrib<T extends number>(
  value: unknown,
): value is Size<T> {
  return isMarkedInternal(value) && (value as Size<T>)?.type === '@size';
}

export function isLocationAttrib<T extends number>(
  value: unknown,
): value is Location<T> {
  return isMarkedInternal(value) &&
    (value as Location<T>)?.type === '@location';
}

export function isInterpolateAttrib<T extends InterpolationType>(
  value: unknown,
): value is Interpolate<T> {
  return isMarkedInternal(value) &&
    (value as Interpolate<T>)?.type === '@interpolate';
}
export function isBuiltinAttrib(
  value: unknown,
): value is Builtin<string> {
  return isMarkedInternal(value) &&
    (value as Builtin<string>)?.type === '@builtin';
}

export function isInvariantAttrib(
  value: unknown,
): value is Invariant {
  return isMarkedInternal(value) &&
    (value as Invariant)?.type === '@invariant';
}

export function isDecorated(
  value: unknown,
): value is Decorated {
  return isMarkedInternal(value) && (value as Decorated)?.type === 'decorated';
}

export function isAbstractFloat(value: unknown): value is AbstractFloat {
  return (
    isMarkedInternal(value) &&
    (value as AbstractFloat).type === 'abstractFloat'
  );
}

export function isAbstractInt(value: unknown): value is AbstractInt {
  return (
    isMarkedInternal(value) &&
    (value as AbstractInt).type === 'abstractInt'
  );
}

export function isAbstract(
  value: unknown,
): value is AbstractFloat | AbstractInt {
  return isAbstractFloat(value) || isAbstractInt(value);
}

export function isConcrete(value: unknown): boolean {
  return !isAbstract(value);
}

export function isVoid(value: unknown): value is Void {
  return isMarkedInternal(value) && (value as Void).type === 'void';
}

export function isNumericSchema(
  schema: unknown,
): schema is AbstractInt | AbstractFloat | F32 | F16 | I32 | U32 {
  const type = (schema as BaseData)?.type;

  return (
    isMarkedInternal(schema) &&
    (type === 'abstractInt' ||
      type === 'abstractFloat' ||
      type === 'f32' ||
      type === 'f16' ||
      type === 'i32' ||
      type === 'u32')
  );
}

export function isHalfPrecisionSchema(
  schema: unknown,
): schema is F16 | Vec2h | Vec3h | Vec4h {
  const type = (schema as BaseData)?.type;

  return (
    isMarkedInternal(schema) &&
    (type === 'f16' ||
      type === 'vec2h' ||
      type === 'vec3h' ||
      type === 'vec4h')
  );
}

const ephemeralTypes = [
  'abstractInt',
  'abstractFloat',
  'f32',
  'f16',
  'i32',
  'u32',
  'bool',
];

/**
 * Returns true for schemas that are not naturally referential in JS (primitives).
 * @param schema
 * @returns
 */
export function isNaturallyEphemeral(schema: unknown): boolean {
  return (
    !isMarkedInternal(schema) ||
    ephemeralTypes.includes((schema as BaseData)?.type)
  );
}

export function WORKAROUND_getSchema<T extends AnyVecInstance | AnyMatInstance>(
  vec: T,
): VecData | MatData {
  // TODO: Remove workaround
  // it's a workaround for circular dependencies caused by us using schemas in the shader generator
  // these schema properties are assigned on the prototype of vector and matrix instances
  // oxlint-disable-next-line typescript/no-explicit-any explained above
  return (vec as any).schema;
}
