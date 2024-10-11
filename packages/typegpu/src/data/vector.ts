import {
  type IMeasurer,
  type IRefResolver,
  type ISchema,
  type ISerialInput,
  type ISerialOutput,
  type MaxValue,
  Measurer,
  type Parsed,
  f32,
  i32,
  u32,
} from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
import { inGPUMode } from '../gpuMode';
import type { TgpuData } from '../types';

// --------------
// Implementation
// --------------

interface VecSchemaOptions<ValueType> {
  unitType: ISchema<number>;
  byteAlignment: number;
  length: number;
  label: string;
  make: (...args: number[]) => ValueType;
  makeFromScalar: (value: number) => ValueType;
}

type VecSchemaBase<ValueType> = TgpuData<ValueType> & {
  kind: string;
  toString(): string;
};

function makeVecSchema<ValueType extends vecBase>(
  options: VecSchemaOptions<ValueType>,
): VecSchemaBase<ValueType> & ((...args: number[]) => ValueType) {
  const VecSchema: VecSchemaBase<ValueType> = {
    // Type-token, not available at runtime
    __unwrapped: undefined as unknown as ValueType,
    isLoose: false as const,

    size: options.length * 4,
    label: options.label,
    byteAlignment: options.byteAlignment,
    kind: options.label,

    resolveReferences(ctx: IRefResolver): void {
      throw new RecursiveDataTypeError();
    },

    write(output: ISerialOutput, value: Parsed<ValueType>): void {
      for (const element of value) {
        options.unitType.write(output, element);
      }
    },

    read(input: ISerialInput): Parsed<ValueType> {
      return options.make(
        ...Array.from({ length: options.length }).map((_) =>
          options.unitType.read(input),
        ),
      ) as Parsed<ValueType>;
    },

    measure(
      _value: Parsed<ValueType> | MaxValue,
      measurer: IMeasurer = new Measurer(),
    ): IMeasurer {
      return measurer.add(this.size);
    },

    seekProperty(
      _reference: Parsed<ValueType> | MaxValue,
      _prop: never,
    ): { bufferOffset: number; schema: ISchema<unknown> } | null {
      throw new Error('Method not implemented.');
    },

    resolve(): string {
      return options.label;
    },

    toString(): string {
      return options.label;
    },
  };

  const construct = (...args: number[]): ValueType => {
    const values = args; // TODO: Allow users to pass in vectors that fill part of the values.

    if (inGPUMode()) {
      return `${VecSchema.kind}(${values.join(', ')})` as unknown as ValueType;
    }

    if (values.length <= 1) {
      return options.makeFromScalar(values[0] ?? 0);
    }

    if (values.length === options.length) {
      return options.make(...values);
    }

    throw new Error(
      `'${options.label}' constructor called with invalid number of arguments.`,
    );
  };

  return Object.assign(construct, VecSchema);
}

abstract class vec2Impl implements vec2 {
  constructor(
    public x: number,
    public y: number,
  ) {}

  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
  }
}

class vec2fImpl extends vec2Impl {
  readonly kind = 'vec2f';

  make2(x: number, y: number): vec2f {
    return new vec2fImpl(x, y) as unknown as vec2f;
  }

  make3(x: number, y: number, z: number): vec3f {
    return new vec3fImpl(x, y, z) as unknown as vec3f;
  }

  make4(x: number, y: number, z: number, w: number): vec4f {
    return new vec4fImpl(x, y, z, w) as unknown as vec4f;
  }
}

class vec2iImpl extends vec2Impl {
  readonly kind = 'vec2i';

  make2(x: number, y: number): vec2i {
    return new vec2iImpl(x, y) as unknown as vec2i;
  }

  make3(x: number, y: number, z: number): vec3i {
    return new vec3iImpl(x, y, z) as unknown as vec3i;
  }

  make4(x: number, y: number, z: number, w: number): vec4i {
    return new vec4iImpl(x, y, z, w) as unknown as vec4i;
  }
}

class vec2uImpl extends vec2Impl {
  readonly kind = 'vec2u';

  make2(x: number, y: number): vec2u {
    return new vec2uImpl(x, y) as unknown as vec2u;
  }

  make3(x: number, y: number, z: number): vec3u {
    return new vec3uImpl(x, y, z) as unknown as vec3u;
  }

  make4(x: number, y: number, z: number, w: number): vec4u {
    return new vec4uImpl(x, y, z, w) as unknown as vec4u;
  }
}

abstract class vec3Impl implements vec3 {
  constructor(
    public x: number,
    public y: number,
    public z: number,
  ) {}

  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
    yield this.z;
  }
}

class vec3fImpl extends vec3Impl {
  readonly kind = 'vec3f';

  make2(x: number, y: number): vec2f {
    return new vec2fImpl(x, y) as unknown as vec2f;
  }

  make3(x: number, y: number, z: number): vec3f {
    return new vec3fImpl(x, y, z) as unknown as vec3f;
  }

  make4(x: number, y: number, z: number, w: number): vec4f {
    return new vec4fImpl(x, y, z, w) as unknown as vec4f;
  }
}

class vec3iImpl extends vec3Impl {
  readonly kind = 'vec3i';

  make2(x: number, y: number): vec2i {
    return new vec2iImpl(x, y) as unknown as vec2i;
  }

  make3(x: number, y: number, z: number): vec3i {
    return new vec3iImpl(x, y, z) as unknown as vec3i;
  }

  make4(x: number, y: number, z: number, w: number): vec4i {
    return new vec4iImpl(x, y, z, w) as unknown as vec4i;
  }
}

class vec3uImpl extends vec3Impl {
  readonly kind = 'vec3u';

  make2(x: number, y: number): vec2u {
    return new vec2uImpl(x, y) as unknown as vec2u;
  }

  make3(x: number, y: number, z: number): vec3u {
    return new vec3uImpl(x, y, z) as unknown as vec3u;
  }

  make4(x: number, y: number, z: number, w: number): vec4u {
    return new vec4uImpl(x, y, z, w) as unknown as vec4u;
  }
}

abstract class vec4Impl implements vec4 {
  constructor(
    public x: number,
    public y: number,
    public z: number,
    public w: number,
  ) {}

  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
    yield this.z;
    yield this.w;
  }
}

class vec4fImpl extends vec4Impl {
  readonly kind = 'vec4f';

  make2(x: number, y: number): vec2f {
    return new vec2fImpl(x, y) as unknown as vec2f;
  }

  make3(x: number, y: number, z: number): vec3f {
    return new vec3fImpl(x, y, z) as unknown as vec3f;
  }

  make4(x: number, y: number, z: number, w: number): vec4f {
    return new vec4fImpl(x, y, z, w) as unknown as vec4f;
  }
}

class vec4iImpl extends vec4Impl {
  readonly kind = 'vec4i';

  make2(x: number, y: number): vec2i {
    return new vec2iImpl(x, y) as unknown as vec2i;
  }

  make3(x: number, y: number, z: number): vec3i {
    return new vec3iImpl(x, y, z) as unknown as vec3i;
  }

  make4(x: number, y: number, z: number, w: number): vec4i {
    return new vec4iImpl(x, y, z, w) as unknown as vec4i;
  }
}

class vec4uImpl extends vec4Impl {
  readonly kind = 'vec4u';

  make2(x: number, y: number): vec2u {
    return new vec2uImpl(x, y) as unknown as vec2u;
  }

  make3(x: number, y: number, z: number): vec3u {
    return new vec3uImpl(x, y, z) as unknown as vec3u;
  }

  make4(x: number, y: number, z: number, w: number): vec4u {
    return new vec4uImpl(x, y, z, w) as unknown as vec4u;
  }
}

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

interface vec2 {
  x: number;
  y: number;
  [Symbol.iterator](): Iterator<number>;
}

interface vec3 {
  x: number;
  y: number;
  z: number;
  [Symbol.iterator](): Iterator<number>;
}

interface vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
  [Symbol.iterator](): Iterator<number>;
}

const vecProxyHandler: ProxyHandler<vecBase> = {
  get: (target, prop) => {
    if (typeof prop === 'symbol') {
      return Reflect.get(target, prop);
    }

    const targetAsVec4 = target as unknown as vec4uImpl;
    const values = new Array(prop.length) as number[];

    let idx = 0;
    for (const char of prop as string) {
      switch (char) {
        case 'x':
          values[idx] = targetAsVec4.x;
          break;
        case 'y':
          values[idx] = targetAsVec4.y;
          break;
        case 'z':
          values[idx] = targetAsVec4.z;
          break;
        case 'w':
          values[idx] = targetAsVec4.w;
          break;
        default:
          return Reflect.get(targetAsVec4, prop);
      }
      idx++;
    }

    if (prop.length === 4) {
      return new Proxy(
        targetAsVec4.make4(
          values[0] as number,
          values[1] as number,
          values[2] as number,
          values[3] as number,
        ),
        vecProxyHandler,
      );
    }

    if (prop.length === 3) {
      return new Proxy(
        targetAsVec4.make3(
          values[0] as number,
          values[1] as number,
          values[2] as number,
        ),
        vecProxyHandler,
      );
    }

    if (prop.length === 2) {
      return new Proxy(
        targetAsVec4.make2(values[0] as number, values[1] as number),
        vecProxyHandler,
      );
    }

    return Reflect.get(target, prop);
  },
};

// ----------
// Public API
// ----------

/**
 * Type encompassing all available kinds of vector.
 */
export type VecKind =
  | 'vec2f'
  | 'vec2i'
  | 'vec2u'
  | 'vec3f'
  | 'vec3i'
  | 'vec3u'
  | 'vec4f'
  | 'vec4i'
  | 'vec4u';

/**
 * Common interface for all vector types, no matter their size and inner type.
 */
export interface vecBase {
  kind: VecKind;
  [Symbol.iterator](): Iterator<number>;
}

/**
 * Interface representing its WGSL vector type counterpart: vec2f or vec2<f32>.
 * A vector with 2 elements of type d.f32
 */
export interface vec2f extends vec2, Swizzle2<vec2f, vec3f, vec4f> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec2f';
}
/**
 * Interface representing its WGSL vector type counterpart: vec2i or vec2<i32>.
 * A vector with 2 elements of type d.i32
 */
export interface vec2i extends vec2, Swizzle2<vec2i, vec3i, vec4i> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec2i';
}
/**
 * Interface representing its WGSL vector type counterpart: vec2u or vec2<u32>.
 * A vector with 2 elements of type d.u32
 */
export interface vec2u extends vec2, Swizzle2<vec2u, vec3u, vec4u> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec2u';
}

/**
 * Interface representing its WGSL vector type counterpart: vec3f or vec3<f32>.
 * A vector with 3 elements of type d.f32
 */
export interface vec3f extends vec3, Swizzle3<vec2f, vec3f, vec4f> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec3f';
}

/**
 * Interface representing its WGSL vector type counterpart: vec3i or vec3<i32>.
 * A vector with 3 elements of type d.i32
 */
export interface vec3i extends vec3, Swizzle3<vec2i, vec3i, vec4i> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec3i';
}

/**
 * Interface representing its WGSL vector type counterpart: vec3u or vec3<u32>.
 * A vector with 3 elements of type d.u32
 */
export interface vec3u extends vec3, Swizzle3<vec2u, vec3u, vec4u> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec3u';
}

/**
 * Interface representing its WGSL vector type counterpart: vec4f or vec4<f32>.
 * A vector with 4 elements of type d.f32
 */
export interface vec4f extends vec4, Swizzle4<vec2f, vec3f, vec4f> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec4f';
}
/**
 * Interface representing its WGSL vector type counterpart: vec4i or vec4<i32>.
 * A vector with 4 elements of type d.i32
 */
export interface vec4i extends vec4, Swizzle4<vec2i, vec3i, vec4i> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec4i';
}
/**
 * Interface representing its WGSL vector type counterpart: vec4u or vec4<u32>.
 * A vector with 4 elements of type d.u32
 */
export interface vec4u extends vec4, Swizzle4<vec2u, vec3u, vec4u> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec4u';
}

/**
 * Type of the `d.vec2f` object/function: vector data type schema/constructor
 */
export type Vec2f = TgpuData<vec2f> & { kind: 'vec2f' } & ((
    x: number,
    y: number,
  ) => vec2f) &
  ((xy: number) => vec2f) &
  (() => vec2f);

/**
 *
 * Schema representing vec2f - a vector with 2 elements of type f32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec2f(); // (0.0, 0.0)
 * const vector = d.vec2f(1); // (1.0, 1.0)
 * const vector = d.vec2f(0.5, 0.1); // (0.5, 0.1)
 *
 * @example
 * const buffer = root.createBuffer(d.vec2f, d.vec2f(0, 1)); // buffer holding a d.vec2f value, with an initial value of vec2f(0, 1);
 */
export const vec2f = makeVecSchema({
  unitType: f32,
  byteAlignment: 8,
  length: 2,
  label: 'vec2f',
  make: (x: number, y: number) =>
    new Proxy(new vec2fImpl(x, y), vecProxyHandler) as vec2f,
  makeFromScalar: (x) =>
    new Proxy(new vec2fImpl(x, x), vecProxyHandler) as vec2f,
}) as Vec2f;

/**
 * Type of the `d.vec2i` object/function: vector data type schema/constructor
 */
export type Vec2i = TgpuData<vec2i> & { kind: 'vec2i' } & ((
    x: number,
    y: number,
  ) => vec2i) &
  ((xy: number) => vec2i) &
  (() => vec2i);

/**
 *
 * Schema representing vec2i - a vector with 2 elements of type i32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec2i(); // (0, 0)
 * const vector = d.vec2i(1); // (1, 1)
 * const vector = d.vec2i(-1, 1); // (-1, 1)
 *
 * @example
 * const buffer = root.createBuffer(d.vec2i, d.vec2i(0, 1)); // buffer holding a d.vec2i value, with an initial value of vec2i(0, 1);
 */
export const vec2i = makeVecSchema({
  unitType: i32,
  byteAlignment: 8,
  length: 2,
  label: 'vec2i',
  make: (x: number, y: number) =>
    new Proxy(new vec2iImpl(x, y), vecProxyHandler) as vec2i,
  makeFromScalar: (x) =>
    new Proxy(new vec2iImpl(x, x), vecProxyHandler) as vec2i,
}) as Vec2i;

/**
 * Type of the `d.vec2u` object/function: vector data type schema/constructor
 */
export type Vec2u = TgpuData<vec2u> & { kind: 'vec2u' } & ((
    x: number,
    y: number,
  ) => vec2u) &
  ((xy: number) => vec2u) &
  (() => vec2u);

/**
 *
 * Schema representing vec2u - a vector with 2 elements of type u32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec2u(); // (0, 0)
 * const vector = d.vec2u(1); // (1, 1)
 * const vector = d.vec2u(1, 2); // (1, 2)
 *
 * @example
 * const buffer = root.createBuffer(d.vec2u, d.vec2u(0, 1)); // buffer holding a d.vec2u value, with an initial value of vec2u(0, 1);
 */
export const vec2u = makeVecSchema({
  unitType: u32,
  byteAlignment: 8,
  length: 2,
  label: 'vec2u',
  make: (x: number, y: number) =>
    new Proxy(new vec2uImpl(x, y), vecProxyHandler) as vec2u,
  makeFromScalar: (x) =>
    new Proxy(new vec2uImpl(x, x), vecProxyHandler) as vec2u,
}) as Vec2u;

/**
 * Type of the `d.vec3f` object/function: vector data type schema/constructor
 */
export type Vec3f = TgpuData<vec3f> & { kind: 'vec3f' } & ((
    x: number,
    y: number,
    z: number,
  ) => vec3f) &
  ((xyz: number) => vec3f) &
  (() => vec3f);

/**
 *
 * Schema representing vec3f - a vector with 3 elements of type f32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec3f(); // (0.0, 0.0, 0.0)
 * const vector = d.vec3f(1); // (1.0, 1.0, 1.0)
 * const vector = d.vec3f(1, 2, 3.5); // (1.0, 2.0, 3.5)
 *
 * @example
 * const buffer = root.createBuffer(d.vec3f, d.vec3f(0, 1, 2)); // buffer holding a d.vec3f value, with an initial value of vec3f(0, 1, 2);
 */
export const vec3f = makeVecSchema({
  unitType: f32,
  byteAlignment: 16,
  length: 3,
  label: 'vec3f',
  make: (x, y, z) =>
    new Proxy(new vec3fImpl(x, y, z), vecProxyHandler) as vec3f,
  makeFromScalar: (x) =>
    new Proxy(new vec3fImpl(x, x, x), vecProxyHandler) as vec3f,
}) as Vec3f;

/**
 * Type of the `d.vec3i` object/function: vector data type schema/constructor
 */
export type Vec3i = TgpuData<vec3i> & { kind: 'vec3i' } & ((
    x: number,
    y: number,
    z: number,
  ) => vec3i) &
  ((xyz: number) => vec3i) &
  (() => vec3i);

/**
 *
 * Schema representing vec3i - a vector with 3 elements of type i32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec3i(); // (0, 0, 0)
 * const vector = d.vec3i(1); // (1, 1, 1)
 * const vector = d.vec3i(1, 2, -3); // (1, 2, -3)
 *
 * @example
 * const buffer = root.createBuffer(d.vec3i, d.vec3i(0, 1, 2)); // buffer holding a d.vec3i value, with an initial value of vec3i(0, 1, 2);
 */
export const vec3i = makeVecSchema({
  unitType: i32,
  byteAlignment: 16,
  length: 3,
  label: 'vec3i',
  make: (x, y, z) =>
    new Proxy(new vec3iImpl(x, y, z), vecProxyHandler) as vec3i,
  makeFromScalar: (x) =>
    new Proxy(new vec3iImpl(x, x, x), vecProxyHandler) as vec3i,
}) as Vec3i;

/**
 * Type of the `d.vec3u` object/function: vector data type schema/constructor
 */
export type Vec3u = TgpuData<vec3u> & { kind: 'vec3u' } & ((
    x: number,
    y: number,
    z: number,
  ) => vec3u) &
  ((xyz: number) => vec3u) &
  (() => vec3u);

/**
 *
 * Schema representing vec3u - a vector with 3 elements of type u32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec3u(); // (0, 0, 0)
 * const vector = d.vec3u(1); // (1, 1, 1)
 * const vector = d.vec3u(1, 2, 3); // (1, 2, 3)
 *
 * @example
 * const buffer = root.createBuffer(d.vec3u, d.vec3u(0, 1, 2)); // buffer holding a d.vec3u value, with an initial value of vec3u(0, 1, 2);
 */
export const vec3u = makeVecSchema({
  unitType: u32,
  byteAlignment: 16,
  length: 3,
  label: 'vec3u',
  make: (x, y, z) =>
    new Proxy(new vec3uImpl(x, y, z), vecProxyHandler) as vec3u,
  makeFromScalar: (x) =>
    new Proxy(new vec3uImpl(x, x, x), vecProxyHandler) as vec3u,
}) as Vec3u;

/**
 * Type of the `d.vec4f` object/function: vector data type schema/constructor
 */
export type Vec4f = TgpuData<vec4f> & { kind: 'vec4f' } & ((
    x: number,
    y: number,
    z: number,
    w: number,
  ) => vec4f) &
  ((xyzw: number) => vec4f) &
  (() => vec4f);

/**
 *
 * Schema representing vec4f - a vector with 4 elements of type f32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec4f(); // (0.0, 0.0, 0.0, 0.0)
 * const vector = d.vec4f(1); // (1.0, 1.0, 1.0, 1.0)
 * const vector = d.vec4f(1, 2, 3, 4.5); // (1.0, 2.0, 3.0, 4.5)
 *
 * @example
 * const buffer = root.createBuffer(d.vec4f, d.vec4f(0, 1, 2, 3)); // buffer holding a d.vec4f value, with an initial value of vec4f(0, 1, 2, 3);
 */
export const vec4f = makeVecSchema({
  unitType: f32,
  byteAlignment: 16,
  length: 4,
  label: 'vec4f',
  make: (x, y, z, w) =>
    new Proxy(new vec4fImpl(x, y, z, w), vecProxyHandler) as vec4f,
  makeFromScalar: (x) =>
    new Proxy(new vec4fImpl(x, x, x, x), vecProxyHandler) as vec4f,
}) as Vec4f;

/**
 * Type of the `d.vec4i` object/function: vector data type schema/constructor
 */
export type Vec4i = TgpuData<vec4i> & { kind: 'vec4i' } & ((
    x: number,
    y: number,
    z: number,
    w: number,
  ) => vec4i) &
  ((xyzw: number) => vec4i) &
  (() => vec4i);

/**
 *
 * Schema representing vec4i - a vector with 4 elements of type i32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec4i(); // (0, 0, 0, 0)
 * const vector = d.vec4i(1); // (1, 1, 1, 1)
 * const vector = d.vec4i(1, 2, 3, -4); // (1, 2, 3, -4)
 *
 * @example
 * const buffer = root.createBuffer(d.vec4i, d.vec4i(0, 1, 2, 3)); // buffer holding a d.vec4i value, with an initial value of vec4i(0, 1, 2, 3);
 */
export const vec4i = makeVecSchema({
  unitType: i32,
  byteAlignment: 16,
  length: 4,
  label: 'vec4i',
  make: (x, y, z, w) =>
    new Proxy(new vec4iImpl(x, y, z, w), vecProxyHandler) as vec4i,
  makeFromScalar: (x) =>
    new Proxy(new vec4iImpl(x, x, x, x), vecProxyHandler) as vec4i,
}) as Vec4i;

/**
 * Type of the `d.vec4u` object/function: vector data type schema/constructor
 */
export type Vec4u = TgpuData<vec4u> & { kind: 'vec4u' } & ((
    x: number,
    y: number,
    z: number,
    w: number,
  ) => vec4u) &
  ((xyzw: number) => vec4u) &
  (() => vec4u);

/**
 *
 * Schema representing vec4u - a vector with 4 elements of type u32.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec4u(); // (0, 0, 0, 0)
 * const vector = d.vec4u(1); // (1, 1, 1, 1)
 * const vector = d.vec4u(1, 2, 3, 4); // (1, 2, 3, 4)
 *
 * @example
 * const buffer = root.createBuffer(d.vec4u, d.vec4u(0, 1, 2, 3)); // buffer holding a d.vec4u value, with an initial value of vec4u(0, 1, 2, 3);
 */
export const vec4u = makeVecSchema({
  unitType: u32,
  byteAlignment: 16,
  length: 4,
  label: 'vec4u',
  make: (x, y, z, w) =>
    new Proxy(new vec4uImpl(x, y, z, w), vecProxyHandler) as vec4u,
  makeFromScalar: (x) =>
    new Proxy(new vec4uImpl(x, x, x, x), vecProxyHandler) as vec4u,
}) as Vec4u;
