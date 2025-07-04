import type { TgpuNamable } from '../shared/meta.ts';
import type {
  Infer,
  InferGPU,
  InferGPURecord,
  InferPartial,
  InferPartialRecord,
  InferRecord,
  MemIdentity,
  MemIdentityRecord,
} from '../shared/repr.ts';
import type {
  $gpuRepr,
  $memIdent,
  $repr,
  $reprPartial,
} from '../shared/symbols.ts';
import { $internal, $wgslDataType } from '../shared/symbols.ts';
import type { Prettify } from '../shared/utilityTypes.ts';

type DecoratedLocation<T extends BaseData> = Decorated<T, Location[]>;

export interface NumberArrayView {
  readonly length: number;
  [n: number]: number;
  [Symbol.iterator]: () => Iterator<number>;
}

export interface BaseData {
  readonly [$internal]: true;
  readonly type: string;
  readonly [$repr]: unknown;
}

export function hasInternalDataType(
  value: unknown,
): value is { [$wgslDataType]: BaseData } {
  return !!(value as { [$wgslDataType]: BaseData })?.[$wgslDataType];
}

export type ExtractTypeLabel<T extends BaseData> = T['type'];

// #region Instance Types

/**
 * Represents a 64-bit integer.
 */
export interface AbstractInt {
  readonly [$internal]: true;
  readonly type: 'abstractInt';
  readonly [$repr]: number;
}

/**
 * Represents a 64-bit IEEE 754 floating point number.
 */
export interface AbstractFloat {
  readonly [$internal]: true;
  readonly type: 'abstractFloat';
  readonly [$repr]: number;
}

export interface Void {
  readonly [$internal]: true;
  readonly type: 'void';
  // biome-ignore lint/suspicious/noConfusingVoidType: <void is void>
  readonly [$repr]: void;
}
export const Void = {
  [$internal]: true,
  type: 'void',
} as Void;

interface Swizzle2<T2, T3, T4> {
  readonly xx: T2;
  readonly xy: T2;
  readonly yx: T2;
  readonly yy: T2;

  readonly xxx: T3;
  readonly xxy: T3;
  readonly xyx: T3;
  readonly xyy: T3;
  readonly yxx: T3;
  readonly yxy: T3;
  readonly yyx: T3;
  readonly yyy: T3;

  readonly xxxx: T4;
  readonly xxxy: T4;
  readonly xxyx: T4;
  readonly xxyy: T4;
  readonly xyxx: T4;
  readonly xyxy: T4;
  readonly xyyx: T4;
  readonly xyyy: T4;
  readonly yxxx: T4;
  readonly yxxy: T4;
  readonly yxyx: T4;
  readonly yxyy: T4;
  readonly yyxx: T4;
  readonly yyxy: T4;
  readonly yyyx: T4;
  readonly yyyy: T4;
}

interface Swizzle3<T2, T3, T4> extends Swizzle2<T2, T3, T4> {
  readonly xz: T2;
  readonly yz: T2;
  readonly zx: T2;
  readonly zy: T2;
  readonly zz: T2;

  readonly xxz: T3;
  readonly xyz: T3;
  readonly xzx: T3;
  readonly xzy: T3;
  readonly xzz: T3;
  readonly yxz: T3;
  readonly yyz: T3;
  readonly yzx: T3;
  readonly yzy: T3;
  readonly yzz: T3;
  readonly zxx: T3;
  readonly zxy: T3;
  readonly zxz: T3;
  readonly zyx: T3;
  readonly zyy: T3;
  readonly zyz: T3;
  readonly zzx: T3;
  readonly zzy: T3;
  readonly zzz: T3;

  readonly xxxz: T4;
  readonly xxyz: T4;
  readonly xxzx: T4;
  readonly xxzy: T4;
  readonly xxzz: T4;
  readonly xyxz: T4;
  readonly xyyz: T4;
  readonly xyzx: T4;
  readonly xyzy: T4;
  readonly xyzz: T4;
  readonly xzxx: T4;
  readonly xzxy: T4;
  readonly xzxz: T4;
  readonly xzyx: T4;
  readonly xzyy: T4;
  readonly xzyz: T4;
  readonly xzzx: T4;
  readonly xzzy: T4;
  readonly xzzz: T4;
  readonly yxxz: T4;
  readonly yxyz: T4;
  readonly yxzx: T4;
  readonly yxzy: T4;
  readonly yxzz: T4;
  readonly yyxz: T4;
  readonly yyyz: T4;
  readonly yyzx: T4;
  readonly yyzy: T4;
  readonly yyzz: T4;
  readonly yzxx: T4;
  readonly yzxy: T4;
  readonly yzxz: T4;
  readonly yzyx: T4;
  readonly yzyy: T4;
  readonly yzyz: T4;
  readonly yzzx: T4;
  readonly yzzy: T4;
  readonly yzzz: T4;
  readonly zxxx: T4;
  readonly zxxy: T4;
  readonly zxxz: T4;
  readonly zxyx: T4;
  readonly zxyy: T4;
  readonly zxyz: T4;
  readonly zxzx: T4;
  readonly zxzy: T4;
  readonly zxzz: T4;
  readonly zyxx: T4;
  readonly zyxy: T4;
  readonly zyxz: T4;
  readonly zyyx: T4;
  readonly zyyy: T4;
  readonly zyyz: T4;
  readonly zyzx: T4;
  readonly zyzy: T4;
  readonly zyzz: T4;
  readonly zzxx: T4;
  readonly zzxy: T4;
  readonly zzxz: T4;
  readonly zzyx: T4;
  readonly zzyy: T4;
  readonly zzyz: T4;
  readonly zzzx: T4;
  readonly zzzy: T4;
  readonly zzzz: T4;
}

interface Swizzle4<T2, T3, T4> extends Swizzle3<T2, T3, T4> {
  readonly yw: T2;
  readonly zw: T2;
  readonly wx: T2;
  readonly wy: T2;
  readonly wz: T2;
  readonly ww: T2;

  readonly xxw: T3;
  readonly xyw: T3;
  readonly xzw: T3;
  readonly xwx: T3;
  readonly xwy: T3;
  readonly xwz: T3;
  readonly xww: T3;
  readonly yxw: T3;
  readonly yyw: T3;
  readonly yzw: T3;
  readonly ywx: T3;
  readonly ywy: T3;
  readonly ywz: T3;
  readonly yww: T3;
  readonly zxw: T3;
  readonly zyw: T3;
  readonly zzw: T3;
  readonly zwx: T3;
  readonly zwy: T3;
  readonly zwz: T3;
  readonly zww: T3;
  readonly wxx: T3;
  readonly wxz: T3;
  readonly wxy: T3;
  readonly wyy: T3;
  readonly wyz: T3;
  readonly wzz: T3;
  readonly wwx: T3;
  readonly wwy: T3;
  readonly wwz: T3;
  readonly www: T3;

  readonly xxxw: T4;
  readonly xxyw: T4;
  readonly xxzw: T4;
  readonly xxwx: T4;
  readonly xxwy: T4;
  readonly xxwz: T4;
  readonly xxww: T4;
  readonly xyxw: T4;
  readonly xyyw: T4;
  readonly xyzw: T4;
  readonly xywx: T4;
  readonly xywy: T4;
  readonly xywz: T4;
  readonly xyww: T4;
  readonly xzxw: T4;
  readonly xzyw: T4;
  readonly xzzw: T4;
  readonly xzwx: T4;
  readonly xzwy: T4;
  readonly xzwz: T4;
  readonly xzww: T4;
  readonly xwxx: T4;
  readonly xwxy: T4;
  readonly xwxz: T4;
  readonly xwyy: T4;
  readonly xwyz: T4;
  readonly xwzz: T4;
  readonly xwwx: T4;
  readonly xwwy: T4;
  readonly xwwz: T4;
  readonly xwww: T4;
  readonly yxxw: T4;
  readonly yxyw: T4;
  readonly yxzw: T4;
  readonly yxwx: T4;
  readonly yxwy: T4;
  readonly yxwz: T4;
  readonly yxww: T4;
  readonly yyxw: T4;
  readonly yyyw: T4;
  readonly yyzw: T4;
  readonly yywx: T4;
  readonly yywy: T4;
  readonly yywz: T4;
  readonly yyww: T4;
  readonly yzxw: T4;
  readonly yzyw: T4;
  readonly yzzw: T4;
  readonly yzwx: T4;
  readonly yzwy: T4;
  readonly yzwz: T4;
  readonly yzww: T4;
  readonly ywxx: T4;
  readonly ywxy: T4;
  readonly ywxz: T4;
  readonly ywxw: T4;
  readonly ywyy: T4;
  readonly ywyz: T4;
  readonly ywzz: T4;
  readonly ywwx: T4;
  readonly ywwy: T4;
  readonly ywwz: T4;
  readonly ywww: T4;
  readonly zxxw: T4;
  readonly zxyw: T4;
  readonly zxzw: T4;
  readonly zxwx: T4;
  readonly zxwy: T4;
  readonly zxwz: T4;
  readonly zxww: T4;
  readonly zyxw: T4;
  readonly zyyw: T4;
  readonly zyzw: T4;
  readonly zywx: T4;
  readonly zywy: T4;
  readonly zywz: T4;
  readonly zyww: T4;
  readonly zzxw: T4;
  readonly zzyw: T4;
  readonly zzzw: T4;
  readonly zzwx: T4;
  readonly zzwy: T4;
  readonly zzwz: T4;
  readonly zzww: T4;
  readonly zwxx: T4;
  readonly zwxy: T4;
  readonly zwxz: T4;
  readonly zwxw: T4;
  readonly zwyy: T4;
  readonly zwyz: T4;
  readonly zwzz: T4;
  readonly zwwx: T4;
  readonly zwwy: T4;
  readonly zwwz: T4;
  readonly zwww: T4;
  readonly wxxx: T4;
  readonly wxxy: T4;
  readonly wxxz: T4;
  readonly wxxw: T4;
  readonly wxyx: T4;
  readonly wxyy: T4;
  readonly wxyz: T4;
  readonly wxyw: T4;
  readonly wxzx: T4;
  readonly wxzy: T4;
  readonly wxzz: T4;
  readonly wxzw: T4;
  readonly wxwx: T4;
  readonly wxwy: T4;
  readonly wxwz: T4;
  readonly wxww: T4;
  readonly wyxx: T4;
  readonly wyxy: T4;
  readonly wyxz: T4;
  readonly wyxw: T4;
  readonly wyyy: T4;
  readonly wyyz: T4;
  readonly wyzw: T4;
  readonly wywx: T4;
  readonly wywy: T4;
  readonly wywz: T4;
  readonly wyww: T4;
  readonly wzxx: T4;
  readonly wzxy: T4;
  readonly wzxz: T4;
  readonly wzxw: T4;
  readonly wzyy: T4;
  readonly wzyz: T4;
  readonly wzzy: T4;
  readonly wzzw: T4;
  readonly wzwx: T4;
  readonly wzwy: T4;
  readonly wzwz: T4;
  readonly wzww: T4;
  readonly wwxx: T4;
  readonly wwxy: T4;
  readonly wwxz: T4;
  readonly wwxw: T4;
  readonly wwyy: T4;
  readonly wwyz: T4;
  readonly wwzz: T4;
  readonly wwwx: T4;
  readonly wwwy: T4;
  readonly wwwz: T4;
  readonly wwww: T4;
}

type Tuple2<S> = [S, S];
type Tuple3<S> = [S, S, S];
type Tuple4<S> = [S, S, S, S];

/**
 * Interface representing its WGSL vector type counterpart: vec2f or vec2<f32>.
 * A vector with 2 elements of type f32
 */
export interface v2f extends Tuple2<number>, Swizzle2<v2f, v3f, v4f> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec2f';
  x: number;
  y: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec2h or vec2<f16>.
 * A vector with 2 elements of type f16
 */
export interface v2h extends Tuple2<number>, Swizzle2<v2h, v3h, v4h> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec2h';
  x: number;
  y: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec2i or vec2<i32>.
 * A vector with 2 elements of type i32
 */
export interface v2i extends Tuple2<number>, Swizzle2<v2i, v3i, v4i> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec2i';
  x: number;
  y: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec2u or vec2<u32>.
 * A vector with 2 elements of type u32
 */
export interface v2u extends Tuple2<number>, Swizzle2<v2u, v3u, v4u> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec2u';
  x: number;
  y: number;
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
}

/**
 * Interface representing its WGSL vector type counterpart: vec3f or vec3<f32>.
 * A vector with 3 elements of type f32
 */
export interface v3f extends Tuple3<number>, Swizzle3<v2f, v3f, v4f> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec3f';
  x: number;
  y: number;
  z: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec3h or vec3<f16>.
 * A vector with 3 elements of type f16
 */
export interface v3h extends Tuple3<number>, Swizzle3<v2h, v3h, v4h> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec3h';
  x: number;
  y: number;
  z: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec3i or vec3<i32>.
 * A vector with 3 elements of type i32
 */
export interface v3i extends Tuple3<number>, Swizzle3<v2i, v3i, v4i> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec3i';
  x: number;
  y: number;
  z: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec3u or vec3<u32>.
 * A vector with 3 elements of type u32
 */
export interface v3u extends Tuple3<number>, Swizzle3<v2u, v3u, v4u> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec3u';
  x: number;
  y: number;
  z: number;
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
}

/**
 * Interface representing its WGSL vector type counterpart: vec4f or vec4<f32>.
 * A vector with 4 elements of type f32
 */
export interface v4f extends Tuple4<number>, Swizzle4<v2f, v3f, v4f> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec4f';
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec4h or vec4<f16>.
 * A vector with 4 elements of type f16
 */
export interface v4h extends Tuple4<number>, Swizzle4<v2h, v3h, v4h> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec4h';
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec4i or vec4<i32>.
 * A vector with 4 elements of type i32
 */
export interface v4i extends Tuple4<number>, Swizzle4<v2i, v3i, v4i> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec4i';
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Interface representing its WGSL vector type counterpart: vec4u or vec4<u32>.
 * A vector with 4 elements of type u32
 */
export interface v4u extends Tuple4<number>, Swizzle4<v2u, v3u, v4u> {
  readonly [$internal]: true;
  /** use to distinguish between vectors of the same size on the type level */
  readonly kind: 'vec4u';
  x: number;
  y: number;
  z: number;
  w: number;
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
}

export type AnyFloat32VecInstance = v2f | v3f | v4f;

export type AnyFloatVecInstance = v2f | v2h | v3f | v3h | v4f | v4h;

export type AnyIntegerVecInstance = v2i | v2u | v3i | v3u | v4i | v4u;

export type AnyBooleanVecInstance = v2b | v3b | v4b;

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

export interface matBase<TColumn> extends NumberArrayView {
  readonly [$internal]: true;
  readonly columns: readonly TColumn[];
}

/**
 * Interface representing its WGSL matrix type counterpart: mat2x2
 * A matrix with 2 rows and 2 columns, with elements of type `TColumn`
 */
export interface mat2x2<TColumn> extends matBase<TColumn> {
  readonly length: 4;
  readonly kind: string;
  /* override */ readonly columns: readonly [TColumn, TColumn];
  [n: number]: number;
}

/**
 * Interface representing its WGSL matrix type counterpart: mat2x2f or mat2x2<f32>
 * A matrix with 2 rows and 2 columns, with elements of type d.f32
 */
export interface m2x2f extends mat2x2<v2f> {
  readonly kind: 'mat2x2f';
}

/**
 * Interface representing its WGSL matrix type counterpart: mat3x3
 * A matrix with 3 rows and 3 columns, with elements of type `TColumn`
 */
export interface mat3x3<TColumn> extends matBase<TColumn> {
  readonly length: 12;
  readonly kind: string;
  /* override */ readonly columns: readonly [TColumn, TColumn, TColumn];
  [n: number]: number;
}

/**
 * Interface representing its WGSL matrix type counterpart: mat3x3f or mat3x3<f32>
 * A matrix with 3 rows and 3 columns, with elements of type d.f32
 */
export interface m3x3f extends mat3x3<v3f> {
  readonly kind: 'mat3x3f';
}

/**
 * Interface representing its WGSL matrix type counterpart: mat4x4
 * A matrix with 4 rows and 4 columns, with elements of type `TColumn`
 */
export interface mat4x4<TColumn> extends matBase<TColumn> {
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
export interface m4x4f extends mat4x4<v4f> {
  readonly kind: 'mat4x4f';
}

export type AnyMatInstance = m2x2f | m3x3f | m4x4f;

export type vBaseForMat<T extends AnyMatInstance> = T extends m2x2f ? v2f
  : T extends m3x3f ? v3f
  : v4f;

export type mBaseForVec<T extends AnyVecInstance> = T extends v2f ? m2x2f
  : T extends v3f ? m3x3f
  : T extends v4f ? m4x4f
  : never;

// #endregion

// #region WGSL Schema Types

/**
 * Boolean schema representing a single WGSL bool value.
 * Cannot be used inside buffers as it is not host-shareable.
 */
export interface Bool {
  readonly [$internal]: true;
  readonly type: 'bool';

  // Type-tokens, not available at runtime
  readonly [$repr]: boolean;
  // ---

  (v?: number | boolean): boolean;
}

/**
 * 32-bit float schema representing a single WGSL f32 value.
 */
export interface F32 {
  readonly [$internal]: true;
  readonly type: 'f32';

  // Type-tokens, not available at runtime
  readonly [$repr]: number;
  // ---

  (v?: number | boolean): number;
}

/**
 * 16-bit float schema representing a single WGSL f16 value.
 */
export interface F16 {
  readonly [$internal]: true;
  readonly type: 'f16';

  // Type-tokens, not available at runtime
  readonly [$repr]: number;
  // ---

  (v?: number | boolean): number;
}

/**
 * Signed 32-bit integer schema representing a single WGSL i32 value.
 */
export interface I32 {
  readonly [$internal]: true;
  readonly type: 'i32';

  // Type-tokens, not available at runtime
  readonly [$repr]: number;
  readonly [$memIdent]: I32 | Atomic<I32> | DecoratedLocation<I32>;
  // ---

  (v?: number | boolean): number;
}

/**
 * Unsigned 32-bit integer schema representing a single WGSL u32 value.
 */
export interface U32 {
  readonly [$internal]: true;
  readonly type: 'u32';

  // Type-tokens, not available at runtime
  readonly [$repr]: number;
  readonly [$memIdent]: U32 | Atomic<U32> | DecoratedLocation<U32>;
  // ---

  (v?: number | boolean): number;
}

/**
 * Unsigned 16-bit integer schema used exclusively for index buffer schemas.
 */
export interface U16 {
  readonly [$internal]: true;
  readonly type: 'u16';
  readonly [$repr]: number;
}

/**
 * Type of the `d.vec2f` object/function: vector data type schema/constructor
 */
export interface Vec2f {
  readonly [$internal]: true;
  readonly type: 'vec2f';

  // Type-tokens, not available at runtime
  readonly [$repr]: v2f;
  // ---

  (x: number, y: number): v2f;
  (xy: number): v2f;
  (): v2f;
  (v: AnyNumericVec2Instance): v2f;
}

/**
 * Type of the `d.vec2h` object/function: vector data type schema/constructor
 */
export interface Vec2h {
  readonly [$internal]: true;
  readonly type: 'vec2h';

  // Type-tokens, not available at runtime
  readonly [$repr]: v2h;
  // ---

  (x: number, y: number): v2h;
  (xy: number): v2h;
  (): v2h;
  (v: AnyNumericVec2Instance): v2h;
}

/**
 * Type of the `d.vec2i` object/function: vector data type schema/constructor
 */
export interface Vec2i {
  readonly [$internal]: true;
  readonly type: 'vec2i';

  // Type-tokens, not available at runtime
  readonly [$repr]: v2i;
  // ---

  (x: number, y: number): v2i;
  (xy: number): v2i;
  (): v2i;
  (v: AnyNumericVec2Instance): v2i;
}

/**
 * Type of the `d.vec2u` object/function: vector data type schema/constructor
 */
export interface Vec2u {
  readonly [$internal]: true;
  readonly type: 'vec2u';

  // Type-tokens, not available at runtime
  readonly [$repr]: v2u;
  // ---

  (x: number, y: number): v2u;
  (xy: number): v2u;
  (): v2u;
  (v: AnyNumericVec2Instance): v2u;
}

/**
 * Type of the `d.vec2b` object/function: vector data type schema/constructor
 * Cannot be used inside buffers as it is not host-shareable.
 */
export interface Vec2b {
  readonly [$internal]: true;
  readonly type: 'vec2<bool>';

  // Type-tokens, not available at runtime
  readonly [$repr]: v2b;
  // ---

  (x: boolean, y: boolean): v2b;
  (xy: boolean): v2b;
  (): v2b;
  (v: v2b): v2b;
}

/**
 * Type of the `d.vec3f` object/function: vector data type schema/constructor
 */
export interface Vec3f {
  readonly [$internal]: true;
  readonly type: 'vec3f';

  // Type-tokens, not available at runtime
  readonly [$repr]: v3f;
  // ---

  (x: number, y: number, z: number): v3f;
  (xyz: number): v3f;
  (): v3f;
  (v: AnyNumericVec3Instance): v3f;
  (v0: AnyNumericVec2Instance, z: number): v3f;
  (x: number, v0: AnyNumericVec2Instance): v3f;
}

/**
 * Type of the `d.vec3h` object/function: vector data type schema/constructor
 */
export interface Vec3h {
  readonly [$internal]: true;
  readonly type: 'vec3h';

  // Type-tokens, not available at runtime
  readonly [$repr]: v3h;
  // ---

  (x: number, y: number, z: number): v3h;
  (xyz: number): v3h;
  (): v3h;
  (v: AnyNumericVec3Instance): v3h;
  (v0: AnyNumericVec2Instance, z: number): v3h;
  (x: number, v0: AnyNumericVec2Instance): v3h;
}

/**
 * Type of the `d.vec3i` object/function: vector data type schema/constructor
 */
export interface Vec3i {
  readonly [$internal]: true;
  readonly type: 'vec3i';

  // Type-tokens, not available at runtime
  readonly [$repr]: v3i;
  // ---

  (x: number, y: number, z: number): v3i;
  (xyz: number): v3i;
  (): v3i;
  (v: AnyNumericVec3Instance): v3i;
  (v0: AnyNumericVec2Instance, z: number): v3i;
  (x: number, v0: AnyNumericVec2Instance): v3i;
}

/**
 * Type of the `d.vec3u` object/function: vector data type schema/constructor
 */
export interface Vec3u {
  readonly [$internal]: true;
  readonly type: 'vec3u';

  // Type-tokens, not available at runtime
  readonly [$repr]: v3u;
  // ---

  (x: number, y: number, z: number): v3u;
  (xyz: number): v3u;
  (): v3u;
  (v: AnyNumericVec3Instance): v3u;
  (v0: AnyNumericVec2Instance, z: number): v3u;
  (x: number, v0: AnyNumericVec2Instance): v3u;
}

/**
 * Type of the `d.vec3b` object/function: vector data type schema/constructor
 * Cannot be used inside buffers as it is not host-shareable.
 */
export interface Vec3b {
  readonly [$internal]: true;
  readonly type: 'vec3<bool>';

  // Type-tokens, not available at runtime
  readonly [$repr]: v3b;
  // ---

  (x: boolean, y: boolean, z: boolean): v3b;
  (xyz: boolean): v3b;
  (): v3b;
  (v: v3b): v3b;
  (v0: v2b, z: boolean): v3b;
  (x: boolean, v0: v2b): v3b;
}

/**
 * Type of the `d.vec4f` object/function: vector data type schema/constructor
 */
export interface Vec4f {
  readonly [$internal]: true;
  readonly type: 'vec4f';

  // Type-tokens, not available at runtime
  readonly [$repr]: v4f;
  // ---

  (x: number, y: number, z: number, w: number): v4f;
  (xyzw: number): v4f;
  (): v4f;
  (v: AnyNumericVec4Instance): v4f;
  (v0: AnyNumericVec3Instance, w: number): v4f;
  (x: number, v0: AnyNumericVec3Instance): v4f;
  (v0: AnyNumericVec2Instance, v1: AnyNumericVec2Instance): v4f;
  (v0: AnyNumericVec2Instance, z: number, w: number): v4f;
  (x: number, v0: AnyNumericVec2Instance, z: number): v4f;
  (x: number, y: number, v0: AnyNumericVec2Instance): v4f;
}

/**
 * Type of the `d.vec4h` object/function: vector data type schema/constructor
 */
export interface Vec4h {
  readonly [$internal]: true;
  readonly type: 'vec4h';

  // Type-tokens, not available at runtime
  readonly [$repr]: v4h;
  // ---

  (x: number, y: number, z: number, w: number): v4h;
  (xyzw: number): v4h;
  (): v4h;
  (v: AnyNumericVec4Instance): v4h;
  (v0: AnyNumericVec3Instance, w: number): v4h;
  (x: number, v0: AnyNumericVec3Instance): v4h;
  (v0: AnyNumericVec2Instance, v1: AnyNumericVec2Instance): v4h;
  (v0: AnyNumericVec2Instance, z: number, w: number): v4h;
  (x: number, v0: AnyNumericVec2Instance, z: number): v4h;
  (x: number, y: number, v0: AnyNumericVec2Instance): v4h;
}

/**
 * Type of the `d.vec4i` object/function: vector data type schema/constructor
 */
export interface Vec4i {
  readonly [$internal]: true;
  readonly type: 'vec4i';

  // Type-tokens, not available at runtime
  readonly [$repr]: v4i;
  // ---

  (x: number, y: number, z: number, w: number): v4i;
  (xyzw: number): v4i;
  (): v4i;
  (v: AnyNumericVec4Instance): v4i;
  (v0: AnyNumericVec3Instance, w: number): v4i;
  (x: number, v0: AnyNumericVec3Instance): v4i;
  (v0: AnyNumericVec2Instance, v1: AnyNumericVec2Instance): v4i;
  (v0: AnyNumericVec2Instance, z: number, w: number): v4i;
  (x: number, v0: AnyNumericVec2Instance, z: number): v4i;
  (x: number, y: number, v0: AnyNumericVec2Instance): v4i;
}

/**
 * Type of the `d.vec4u` object/function: vector data type schema/constructor
 */
export interface Vec4u {
  readonly [$internal]: true;
  readonly type: 'vec4u';

  // Type-tokens, not available at runtime
  readonly [$repr]: v4u;
  // ---

  (x: number, y: number, z: number, w: number): v4u;
  (xyzw: number): v4u;
  (): v4u;
  (v: AnyNumericVec4Instance): v4u;
  (v0: AnyNumericVec3Instance, w: number): v4u;
  (x: number, v0: AnyNumericVec3Instance): v4u;
  (v0: AnyNumericVec2Instance, v1: AnyNumericVec2Instance): v4u;
  (v0: AnyNumericVec2Instance, z: number, w: number): v4u;
  (x: number, v0: AnyNumericVec2Instance, z: number): v4u;
  (x: number, y: number, v0: AnyNumericVec2Instance): v4u;
}

/**
 * Type of the `d.vec4b` object/function: vector data type schema/constructor
 * Cannot be used inside buffers as it is not host-shareable.
 */
export interface Vec4b {
  readonly [$internal]: true;
  readonly type: 'vec4<bool>';

  // Type-tokens, not available at runtime
  readonly [$repr]: v4b;
  // ---

  (x: boolean, y: boolean, z: boolean, w: boolean): v4b;
  (xyzw: boolean): v4b;
  (): v4b;
  (v: v4b): v4b;
  (v0: v3b, w: boolean): v4b;
  (x: boolean, v0: v3b): v4b;
  (v0: v2b, v1: v2b): v4b;
  (v0: v2b, z: boolean, w: boolean): v4b;
  (x: boolean, v0: v2b, z: boolean): v4b;
  (x: boolean, y: boolean, v0: v2b): v4b;
}

/**
 * Type of the `d.mat2x2f` object/function: matrix data type schema/constructor
 */
export interface Mat2x2f {
  readonly [$internal]: true;
  readonly type: 'mat2x2f';

  // Type-tokens, not available at runtime
  readonly [$repr]: m2x2f;
  // ---

  (...elements: [number, number, number, number]): m2x2f;
  (...columns: [v2f, v2f]): m2x2f;
  (): m2x2f;
  identity(): m2x2f;
}

/**
 * Type of the `d.mat3x3f` object/function: matrix data type schema/constructor
 */
export interface Mat3x3f {
  readonly [$internal]: true;
  readonly type: 'mat3x3f';

  // Type-tokens, not available at runtime
  readonly [$repr]: m3x3f;
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
export interface Mat4x4f {
  readonly [$internal]: true;
  readonly type: 'mat4x4f';

  // Type-tokens, not available at runtime
  readonly [$repr]: m4x4f;
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
export interface WgslArray<TElement extends BaseData = BaseData> {
  readonly [$internal]: true;
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
  TProps extends Record<string, BaseData> = Record<string, BaseData>,
> extends TgpuNamable {
  (props: Prettify<InferRecord<TProps>>): Prettify<InferRecord<TProps>>;
  readonly [$internal]: true;
  readonly type: 'struct';
  readonly propTypes: TProps;

  // Type-tokens, not available at runtime
  readonly [$repr]: Prettify<InferRecord<TProps>>;
  readonly [$gpuRepr]: Prettify<InferGPURecord<TProps>>;
  readonly [$memIdent]: WgslStruct<Prettify<MemIdentityRecord<TProps>>>;
  readonly [$reprPartial]:
    | Prettify<Partial<InferPartialRecord<TProps>>>
    | undefined;
  // ---
}

// biome-ignore lint/suspicious/noExplicitAny: <we need the type to be broader than WgslStruct<Record<string, BaseWgslData>>
export type AnyWgslStruct = WgslStruct<any>;

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
  TInner extends BaseData = BaseData, // can also be sampler or texture (╯'□')╯︵ ┻━┻
  TAccess extends Access = Access,
> {
  readonly [$internal]: true;
  readonly type: 'ptr';
  readonly inner: TInner;
  readonly addressSpace: TAddr;
  readonly access: TAccess;

  // Type-tokens, not available at runtime
  readonly [$repr]: Infer<TInner>;
  // ---
}

/**
 * Schema representing the `atomic<...>` WGSL data type.
 */
export interface Atomic<TInner extends U32 | I32 = U32 | I32> {
  readonly [$internal]: true;
  readonly type: 'atomic';
  readonly inner: TInner;

  // Type-tokens, not available at runtime
  readonly [$repr]: Infer<TInner>;
  readonly [$gpuRepr]: TInner extends U32 ? atomicU32 : atomicI32;
  readonly [$memIdent]: MemIdentity<TInner>;
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
  readonly value: T;
}

export interface Size<T extends number> {
  readonly [$internal]: true;
  readonly type: '@size';
  readonly value: T;
}

export interface Location<T extends number = number> {
  readonly [$internal]: true;
  readonly type: '@location';
  readonly value: T;
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
  readonly value: T;
}

export interface Builtin<T extends string> {
  readonly [$internal]: true;
  readonly type: '@builtin';
  readonly value: T;
}

export interface Decorated<
  TInner extends BaseData = BaseData,
  TAttribs extends unknown[] = unknown[],
> {
  readonly [$internal]: true;
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
] as const;

export type WgslTypeLiteral = (typeof wgslTypeLiterals)[number];

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

export type ScalarData =
  | Bool
  | F32
  | F16
  | I32
  | U32
  | AbstractInt
  | AbstractFloat;

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
  | AnyWgslStruct
  | WgslArray
  | Ptr
  | Atomic<U32>
  | Atomic<I32>
  | Decorated
  | AbstractInt
  | AbstractFloat
  | Void;

// #endregion

export function isVecInstance(value: unknown): value is AnyVecInstance {
  const v = value as AnyVecInstance | undefined;
  return !!v?.[$internal] &&
    typeof v.kind?.startsWith === 'function' &&
    v.kind.startsWith('vec');
}

export function isVec2(value: unknown): value is Vec2f | Vec2h | Vec2i | Vec2u {
  const v = value as AnyWgslData | undefined;
  return !!v?.[$internal] &&
    typeof v.type?.startsWith === 'function' &&
    v.type.startsWith?.('vec2');
}

export function isVec3(value: unknown): value is Vec3f | Vec3h | Vec3i | Vec3u {
  const v = value as AnyWgslData | undefined;
  return !!v?.[$internal] &&
    typeof v.type?.startsWith === 'function' &&
    v.type.startsWith('vec3');
}

export function isVec4(value: unknown): value is Vec4f | Vec4h | Vec4i | Vec4u {
  const v = value as AnyWgslData | undefined;
  return !!v?.[$internal] &&
    typeof v.type?.startsWith === 'function' &&
    v.type.startsWith('vec4');
}

export function isVec(
  value: unknown,
): value is
  | Vec2f
  | Vec2h
  | Vec2i
  | Vec2u
  | Vec3f
  | Vec3h
  | Vec3i
  | Vec3u
  | Vec4f
  | Vec4h
  | Vec4i
  | Vec4u {
  return isVec2(value) || isVec3(value) || isVec4(value);
}

export function isMatInstance(value: unknown): value is AnyMatInstance {
  const v = value as AnyMatInstance | undefined;
  return !!v?.[$internal] &&
    typeof v.kind?.startsWith === 'function' &&
    v.kind.startsWith('mat');
}

export function isMat2x2f(value: unknown): value is Mat2x2f {
  return (
    (value as AnyWgslData)?.[$internal] &&
    (value as AnyWgslData)?.type === 'mat2x2f'
  );
}

export function isMat3x3f(value: unknown): value is Mat3x3f {
  return (
    (value as AnyWgslData)?.[$internal] &&
    (value as AnyWgslData)?.type === 'mat3x3f'
  );
}

export function isMat4x4f(value: unknown): value is Mat4x4f {
  return (
    (value as AnyWgslData)?.[$internal] &&
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
    (value as AnyWgslData)?.[$internal] &&
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
export function isWgslArray<T extends WgslArray>(
  schema: T | unknown,
): schema is T {
  return (schema as T)?.[$internal] && (schema as T)?.type === 'array';
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
export function isWgslStruct<T extends WgslStruct>(
  schema: T | unknown,
): schema is T {
  return (schema as T)?.[$internal] && (schema as T)?.type === 'struct';
}

/**
 * Checks whether passed in value is a pointer ('function' scope) schema.
 *
 * @example
 * isPtrFn(d.ptrFn(d.f32)) // true
 * isPtrFn(d.f32) // false
 */
export function isPtr<T extends Ptr>(schema: T | unknown): schema is T {
  return (schema as T)?.[$internal] && (schema as T)?.type === 'ptr';
}

/**
 * Checks whether the passed in value is an atomic schema.
 *
 * @example
 * isAtomic(d.atomic(d.u32)) // true
 * isAtomic(d.u32) // false
 */
export function isAtomic<T extends Atomic<U32 | I32>>(
  schema: T | unknown,
): schema is T {
  return (schema as T)?.[$internal] && (schema as T)?.type === 'atomic';
}

export function isAlignAttrib<T extends Align<number>>(
  value: unknown | T,
): value is T {
  return (value as T)?.[$internal] && (value as T)?.type === '@align';
}

export function isSizeAttrib<T extends Size<number>>(
  value: unknown | T,
): value is T {
  return (value as T)?.[$internal] && (value as T)?.type === '@size';
}

export function isLocationAttrib<T extends Location<number>>(
  value: unknown | T,
): value is T {
  return (value as T)?.[$internal] && (value as T)?.type === '@location';
}

export function isInterpolateAttrib<T extends Interpolate<InterpolationType>>(
  value: unknown | T,
): value is T {
  return (value as T)?.[$internal] && (value as T)?.type === '@interpolate';
}

export function isBuiltinAttrib<T extends Builtin<string>>(
  value: unknown | T,
): value is T {
  return (value as T)?.[$internal] && (value as T)?.type === '@builtin';
}

export function isDecorated<T extends Decorated>(
  value: unknown | T,
): value is T {
  return (value as T)?.[$internal] && (value as T)?.type === 'decorated';
}

export function isAbstractFloat(value: unknown): value is AbstractFloat {
  return (
    (value as AbstractFloat)?.[$internal] &&
    (value as AbstractFloat).type === 'abstractFloat'
  );
}

export function isAbstractInt(value: unknown): value is AbstractInt {
  return (
    (value as AbstractInt)?.[$internal] &&
    (value as AbstractInt).type === 'abstractInt'
  );
}

export function isVoid(value: unknown): value is Void {
  return (value as Void)?.[$internal] && (value as Void).type === 'void';
}
