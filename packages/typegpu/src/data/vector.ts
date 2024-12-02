import { inGPUMode } from '../gpuMode';
import type { NumberArrayView, TgpuResolvable } from '../types';
import type {
  Vec2f,
  Vec2i,
  Vec2u,
  Vec3f,
  Vec3i,
  Vec3u,
  Vec4f,
  Vec4i,
  Vec4u,
  vec2f as vec2fType,
  vec2i as vec2iType,
  vec2u as vec2uType,
  vec3f as vec3fType,
  vec3i as vec3iType,
  vec3u as vec3uType,
  vec4f as vec4fType,
  vec4i as vec4iType,
  vec4u as vec4uType,
} from './wgslTypes';

// --------------
// Implementation
// --------------

interface VecSchemaOptions<TType extends string, TValue> {
  type: TType;
  length: number;
  make: (...args: number[]) => TValue;
  makeFromScalar: (value: number) => TValue;
}

type VecSchemaBase<TValue> = {
  readonly type: string;
  readonly __repr: TValue;
};

function makeVecSchema<TType extends string, TValue>(
  options: VecSchemaOptions<TType, TValue>,
): VecSchemaBase<TValue> & ((...args: number[]) => TValue) {
  const VecSchema: VecSchemaBase<TValue> = {
    /** Type-token, not available at runtime */
    __repr: undefined as unknown as TValue,
    type: options.type,
  };

  const construct = (...args: number[]): TValue => {
    const values = args; // TODO: Allow users to pass in vectors that fill part of the values.

    if (inGPUMode()) {
      return `${VecSchema.type}(${values.join(', ')})` as unknown as TValue;
    }

    if (values.length <= 1) {
      return options.makeFromScalar(values[0] ?? 0);
    }

    if (values.length === options.length) {
      return options.make(...values);
    }

    throw new Error(
      `'${options.type}' constructor called with invalid number of arguments.`,
    );
  };

  return Object.assign(construct, VecSchema);
}

abstract class vec2Impl implements vec2 {
  public readonly length = 2;
  abstract readonly kind: `vec2${'f' | 'u' | 'i'}`;

  [n: number]: number;

  constructor(
    public x: number,
    public y: number,
  ) {}

  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
  }

  get [0]() {
    return this.x;
  }

  get [1]() {
    return this.y;
  }

  set [0](value: number) {
    this.x = value;
  }

  set [1](value: number) {
    this.y = value;
  }

  resolve(): string {
    return `${this.kind}(${this.x}, ${this.y})`;
  }
}

class vec2fImpl extends vec2Impl {
  readonly kind = 'vec2f';

  make2(x: number, y: number): vec2fType {
    return new vec2fImpl(x, y) as unknown as vec2fType;
  }

  make3(x: number, y: number, z: number): vec3fType {
    return new vec3fImpl(x, y, z) as unknown as vec3fType;
  }

  make4(x: number, y: number, z: number, w: number): vec4fType {
    return new vec4fImpl(x, y, z, w) as unknown as vec4fType;
  }
}

class vec2iImpl extends vec2Impl {
  readonly kind = 'vec2i';

  make2(x: number, y: number): vec2iType {
    return new vec2iImpl(x, y) as unknown as vec2iType;
  }

  make3(x: number, y: number, z: number): vec3iType {
    return new vec3iImpl(x, y, z) as unknown as vec3iType;
  }

  make4(x: number, y: number, z: number, w: number): vec4iType {
    return new vec4iImpl(x, y, z, w) as unknown as vec4iType;
  }
}

class vec2uImpl extends vec2Impl {
  readonly kind = 'vec2u';

  make2(x: number, y: number): vec2uType {
    return new vec2uImpl(x, y) as unknown as vec2uType;
  }

  make3(x: number, y: number, z: number): vec3uType {
    return new vec3uImpl(x, y, z) as unknown as vec3uType;
  }

  make4(x: number, y: number, z: number, w: number): vec4uType {
    return new vec4uImpl(x, y, z, w) as unknown as vec4uType;
  }
}

abstract class vec3Impl implements vec3 {
  public readonly length = 3;
  abstract readonly kind: `vec3${'f' | 'u' | 'i'}`;
  [n: number]: number;

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

  get [0]() {
    return this.x;
  }

  get [1]() {
    return this.y;
  }

  get [2]() {
    return this.z;
  }

  set [0](value: number) {
    this.x = value;
  }

  set [1](value: number) {
    this.y = value;
  }

  set [2](value: number) {
    this.z = value;
  }

  resolve(): string {
    return `${this.kind}(${this.x}, ${this.y}, ${this.z})`;
  }
}

class vec3fImpl extends vec3Impl {
  readonly kind = 'vec3f';

  make2(x: number, y: number): vec2fType {
    return new vec2fImpl(x, y) as unknown as vec2fType;
  }

  make3(x: number, y: number, z: number): vec3fType {
    return new vec3fImpl(x, y, z) as unknown as vec3fType;
  }

  make4(x: number, y: number, z: number, w: number): vec4fType {
    return new vec4fImpl(x, y, z, w) as unknown as vec4fType;
  }
}

class vec3iImpl extends vec3Impl {
  readonly kind = 'vec3i';

  make2(x: number, y: number): vec2iType {
    return new vec2iImpl(x, y) as unknown as vec2iType;
  }

  make3(x: number, y: number, z: number): vec3iType {
    return new vec3iImpl(x, y, z) as unknown as vec3iType;
  }

  make4(x: number, y: number, z: number, w: number): vec4iType {
    return new vec4iImpl(x, y, z, w) as unknown as vec4iType;
  }
}

class vec3uImpl extends vec3Impl {
  readonly kind = 'vec3u';

  make2(x: number, y: number): vec2uType {
    return new vec2uImpl(x, y) as unknown as vec2uType;
  }

  make3(x: number, y: number, z: number): vec3uType {
    return new vec3uImpl(x, y, z) as unknown as vec3uType;
  }

  make4(x: number, y: number, z: number, w: number): vec4uType {
    return new vec4uImpl(x, y, z, w) as unknown as vec4uType;
  }
}

abstract class vec4Impl implements vec4 {
  public readonly length = 4;
  abstract readonly kind: `vec4${'f' | 'u' | 'i'}`;
  [n: number]: number;

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

  get [0]() {
    return this.x;
  }

  get [1]() {
    return this.y;
  }

  get [2]() {
    return this.z;
  }

  get [3]() {
    return this.w;
  }

  set [0](value: number) {
    this.x = value;
  }

  set [1](value: number) {
    this.y = value;
  }

  set [2](value: number) {
    this.z = value;
  }

  set [3](value: number) {
    this.w = value;
  }

  resolve(): string {
    return `${this.kind}(${this.x}, ${this.y}, ${this.z}, ${this.w})`;
  }
}

class vec4fImpl extends vec4Impl {
  readonly kind = 'vec4f';

  make2(x: number, y: number): vec2fType {
    return new vec2fImpl(x, y) as unknown as vec2fType;
  }

  make3(x: number, y: number, z: number): vec3fType {
    return new vec3fImpl(x, y, z) as unknown as vec3fType;
  }

  make4(x: number, y: number, z: number, w: number): vec4fType {
    return new vec4fImpl(x, y, z, w) as unknown as vec4fType;
  }
}

class vec4iImpl extends vec4Impl {
  readonly kind = 'vec4i';

  make2(x: number, y: number): vec2iType {
    return new vec2iImpl(x, y) as unknown as vec2iType;
  }

  make3(x: number, y: number, z: number): vec3iType {
    return new vec3iImpl(x, y, z) as unknown as vec3iType;
  }

  make4(x: number, y: number, z: number, w: number): vec4iType {
    return new vec4iImpl(x, y, z, w) as unknown as vec4iType;
  }
}

class vec4uImpl extends vec4Impl {
  readonly kind = 'vec4u';

  make2(x: number, y: number): vec2uType {
    return new vec2uImpl(x, y) as unknown as vec2uType;
  }

  make3(x: number, y: number, z: number): vec3uType {
    return new vec3uImpl(x, y, z) as unknown as vec3uType;
  }

  make4(x: number, y: number, z: number, w: number): vec4uType {
    return new vec4uImpl(x, y, z, w) as unknown as vec4uType;
  }
}

interface vec2 extends NumberArrayView, TgpuResolvable {
  x: number;
  y: number;
  [Symbol.iterator](): Iterator<number>;
}

interface vec3 extends NumberArrayView, TgpuResolvable {
  x: number;
  y: number;
  z: number;
  [Symbol.iterator](): Iterator<number>;
}

interface vec4 extends NumberArrayView, TgpuResolvable {
  x: number;
  y: number;
  z: number;
  w: number;
  [Symbol.iterator](): Iterator<number>;
}

const vecProxyHandler: ProxyHandler<vecBase> = {
  get: (target, prop) => {
    if (typeof prop === 'symbol' || !Number.isNaN(Number.parseInt(prop))) {
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
export interface vecBase extends NumberArrayView {
  kind: VecKind;
}

/**
 * Type of the `d.vec2f` object/function: vector data type schema/constructor
 */
export type Vec2fConstructor = ((x: number, y: number) => vec2fType) &
  ((xy: number) => vec2fType) &
  (() => vec2fType);

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
  type: 'vec2f',
  length: 2,
  make: (x: number, y: number) =>
    new Proxy(new vec2fImpl(x, y), vecProxyHandler) as vec2fType,
  makeFromScalar: (x) =>
    new Proxy(new vec2fImpl(x, x), vecProxyHandler) as vec2fType,
}) as Vec2f & Vec2fConstructor;

/**
 * Type of the `d.vec2i` object/function: vector data type schema/constructor
 */
export type Vec2iConstructor = ((x: number, y: number) => vec2iType) &
  ((xy: number) => vec2iType) &
  (() => vec2iType);

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
  type: 'vec2i',
  length: 2,
  make: (x: number, y: number) =>
    new Proxy(new vec2iImpl(x, y), vecProxyHandler) as vec2iType,
  makeFromScalar: (x) =>
    new Proxy(new vec2iImpl(x, x), vecProxyHandler) as vec2iType,
}) as Vec2i & Vec2iConstructor;

/**
 * Type of the `d.vec2u` object/function: vector data type schema/constructor
 */
export type Vec2uConstructor = ((x: number, y: number) => vec2uType) &
  ((xy: number) => vec2uType) &
  (() => vec2uType);

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
  type: 'vec2u',
  length: 2,
  make: (x: number, y: number) =>
    new Proxy(new vec2uImpl(x, y), vecProxyHandler) as vec2uType,
  makeFromScalar: (x) =>
    new Proxy(new vec2uImpl(x, x), vecProxyHandler) as vec2uType,
}) as Vec2u & Vec2uConstructor;

/**
 * Type of the `d.vec3f` object/function: vector data type schema/constructor
 */
export type Vec3fConstructor = ((
  x: number,
  y: number,
  z: number,
) => vec3fType) &
  ((xyz: number) => vec3fType) &
  (() => vec3fType);

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
  type: 'vec3f',
  length: 3,
  make: (x, y, z) =>
    new Proxy(new vec3fImpl(x, y, z), vecProxyHandler) as vec3fType,
  makeFromScalar: (x) =>
    new Proxy(new vec3fImpl(x, x, x), vecProxyHandler) as vec3fType,
}) as Vec3f & Vec3fConstructor;

/**
 * Type of the `d.vec3i` object/function: vector data type schema/constructor
 */
export type Vec3iConstructor = ((
  x: number,
  y: number,
  z: number,
) => vec3iType) &
  ((xyz: number) => vec3iType) &
  (() => vec3iType);

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
  type: 'vec3i',
  length: 3,
  make: (x, y, z) =>
    new Proxy(new vec3iImpl(x, y, z), vecProxyHandler) as vec3iType,
  makeFromScalar: (x) =>
    new Proxy(new vec3iImpl(x, x, x), vecProxyHandler) as vec3iType,
}) as Vec3i & Vec3iConstructor;

/**
 * Type of the `d.vec3u` object/function: vector data type schema/constructor
 */
export type Vec3uConstructor = ((
  x: number,
  y: number,
  z: number,
) => vec3uType) &
  ((xyz: number) => vec3uType) &
  (() => vec3uType);

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
  type: 'vec3u',
  length: 3,
  make: (x, y, z) =>
    new Proxy(new vec3uImpl(x, y, z), vecProxyHandler) as vec3uType,
  makeFromScalar: (x) =>
    new Proxy(new vec3uImpl(x, x, x), vecProxyHandler) as vec3uType,
}) as Vec3u & Vec3uConstructor;

/**
 * Type of the `d.vec4f` object/function: vector data type schema/constructor
 */
export type Vec4fConstructor = ((
  x: number,
  y: number,
  z: number,
  w: number,
) => vec4fType) &
  ((xyzw: number) => vec4fType) &
  (() => vec4fType);

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
  type: 'vec4f',
  length: 4,
  make: (x, y, z, w) =>
    new Proxy(new vec4fImpl(x, y, z, w), vecProxyHandler) as vec4fType,
  makeFromScalar: (x) =>
    new Proxy(new vec4fImpl(x, x, x, x), vecProxyHandler) as vec4fType,
}) as Vec4f & Vec4fConstructor;

/**
 * Type of the `d.vec4i` object/function: vector data type schema/constructor
 */
export type Vec4iConstructor = ((
  x: number,
  y: number,
  z: number,
  w: number,
) => vec4iType) &
  ((xyzw: number) => vec4iType) &
  (() => vec4iType);

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
  type: 'vec4i',
  length: 4,
  make: (x, y, z, w) =>
    new Proxy(new vec4iImpl(x, y, z, w), vecProxyHandler) as vec4iType,
  makeFromScalar: (x) =>
    new Proxy(new vec4iImpl(x, x, x, x), vecProxyHandler) as vec4iType,
}) as Vec4i & Vec4iConstructor;

/**
 * Type of the `d.vec4u` object/function: vector data type schema/constructor
 */
export type Vec4uConstructor = ((
  x: number,
  y: number,
  z: number,
  w: number,
) => vec4uType) &
  ((xyzw: number) => vec4uType) &
  (() => vec4uType);

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
  length: 4,
  type: 'vec4u',
  make: (x, y, z, w) =>
    new Proxy(new vec4uImpl(x, y, z, w), vecProxyHandler) as vec4uType,
  makeFromScalar: (x) =>
    new Proxy(new vec4uImpl(x, x, x, x), vecProxyHandler) as vec4uType,
}) as Vec4u & Vec4uConstructor;
