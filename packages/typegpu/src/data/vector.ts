import { inGPUMode } from '../gpuMode';
import type {
  Vec2f,
  Vec2h,
  Vec2i,
  Vec2u,
  Vec3f,
  Vec3h,
  Vec3i,
  Vec3u,
  Vec4f,
  Vec4h,
  Vec4i,
  Vec4u,
  v2f,
  v2h,
  v2i,
  v2u,
  v3f,
  v3h,
  v3i,
  v3u,
  v4f,
  v4h,
  v4i,
  v4u,
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
  readonly '~repr': TValue;
};

function makeVecSchema<TType extends string, TValue>(
  options: VecSchemaOptions<TType, TValue>,
): VecSchemaBase<TValue> & ((...args: number[]) => TValue) {
  const VecSchema: VecSchemaBase<TValue> = {
    /** Type-token, not available at runtime */
    '~repr': undefined as unknown as TValue,
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

abstract class vec2Impl {
  public readonly length = 2;
  abstract readonly kind: `vec2${'f' | 'u' | 'i' | 'h'}`;

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

  '~resolve'(): string {
    return `${this.kind}(${this.x}, ${this.y})`;
  }

  toString() {
    return this['~resolve']();
  }
}

class vec2fImpl extends vec2Impl {
  readonly kind = 'vec2f';

  make2(x: number, y: number): v2f {
    return new vec2fImpl(x, y) as unknown as v2f;
  }

  make3(x: number, y: number, z: number): v3f {
    return new vec3fImpl(x, y, z) as unknown as v3f;
  }

  make4(x: number, y: number, z: number, w: number): v4f {
    return new vec4fImpl(x, y, z, w) as unknown as v4f;
  }
}

class vec2hImpl extends vec2Impl {
  readonly kind = 'vec2h';

  make2(x: number, y: number): v2h {
    return new vec2hImpl(x, y) as unknown as v2h;
  }

  make3(x: number, y: number, z: number): v3h {
    return new vec3hImpl(x, y, z) as unknown as v3h;
  }

  make4(x: number, y: number, z: number, w: number): v4h {
    return new vec4hImpl(x, y, z, w) as unknown as v4h;
  }
}

class vec2iImpl extends vec2Impl {
  readonly kind = 'vec2i';

  make2(x: number, y: number): v2i {
    return new vec2iImpl(x, y) as unknown as v2i;
  }

  make3(x: number, y: number, z: number): v3i {
    return new vec3iImpl(x, y, z) as unknown as v3i;
  }

  make4(x: number, y: number, z: number, w: number): v4i {
    return new vec4iImpl(x, y, z, w) as unknown as v4i;
  }
}

class vec2uImpl extends vec2Impl {
  readonly kind = 'vec2u';

  make2(x: number, y: number): v2u {
    return new vec2uImpl(x, y) as unknown as v2u;
  }

  make3(x: number, y: number, z: number): v3u {
    return new vec3uImpl(x, y, z) as unknown as v3u;
  }

  make4(x: number, y: number, z: number, w: number): v4u {
    return new vec4uImpl(x, y, z, w) as unknown as v4u;
  }
}

abstract class vec3Impl {
  public readonly length = 3;
  abstract readonly kind: `vec3${'f' | 'u' | 'i' | 'h'}`;
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

  '~resolve'(): string {
    return `${this.kind}(${this.x}, ${this.y}, ${this.z})`;
  }

  toString() {
    return this['~resolve']();
  }
}

class vec3fImpl extends vec3Impl {
  readonly kind = 'vec3f';

  make2(x: number, y: number): v2f {
    return new vec2fImpl(x, y) as unknown as v2f;
  }

  make3(x: number, y: number, z: number): v3f {
    return new vec3fImpl(x, y, z) as unknown as v3f;
  }

  make4(x: number, y: number, z: number, w: number): v4f {
    return new vec4fImpl(x, y, z, w) as unknown as v4f;
  }
}

class vec3hImpl extends vec3Impl {
  readonly kind = 'vec3h';

  make2(x: number, y: number): v2h {
    return new vec2hImpl(x, y) as unknown as v2h;
  }

  make3(x: number, y: number, z: number): v3h {
    return new vec3hImpl(x, y, z) as unknown as v3h;
  }

  make4(x: number, y: number, z: number, w: number): v4h {
    return new vec4hImpl(x, y, z, w) as unknown as v4h;
  }
}

class vec3iImpl extends vec3Impl {
  readonly kind = 'vec3i';

  make2(x: number, y: number): v2i {
    return new vec2iImpl(x, y) as unknown as v2i;
  }

  make3(x: number, y: number, z: number): v3i {
    return new vec3iImpl(x, y, z) as unknown as v3i;
  }

  make4(x: number, y: number, z: number, w: number): v4i {
    return new vec4iImpl(x, y, z, w) as unknown as v4i;
  }
}

class vec3uImpl extends vec3Impl {
  readonly kind = 'vec3u';

  make2(x: number, y: number): v2u {
    return new vec2uImpl(x, y) as unknown as v2u;
  }

  make3(x: number, y: number, z: number): v3u {
    return new vec3uImpl(x, y, z) as unknown as v3u;
  }

  make4(x: number, y: number, z: number, w: number): v4u {
    return new vec4uImpl(x, y, z, w) as unknown as v4u;
  }
}

abstract class vec4Impl {
  public readonly length = 4;
  abstract readonly kind: `vec4${'f' | 'u' | 'i' | 'h'}`;
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

  '~resolve'(): string {
    return `${this.kind}(${this.x}, ${this.y}, ${this.z}, ${this.w})`;
  }

  toString() {
    return this['~resolve']();
  }
}

class vec4fImpl extends vec4Impl {
  readonly kind = 'vec4f';

  make2(x: number, y: number): v2f {
    return new vec2fImpl(x, y) as unknown as v2f;
  }

  make3(x: number, y: number, z: number): v3f {
    return new vec3fImpl(x, y, z) as unknown as v3f;
  }

  make4(x: number, y: number, z: number, w: number): v4f {
    return new vec4fImpl(x, y, z, w) as unknown as v4f;
  }
}

class vec4hImpl extends vec4Impl {
  readonly kind = 'vec4h';

  make2(x: number, y: number): v2h {
    return new vec2hImpl(x, y) as unknown as v2h;
  }

  make3(x: number, y: number, z: number): v3h {
    return new vec3hImpl(x, y, z) as unknown as v3h;
  }

  make4(x: number, y: number, z: number, w: number): v4h {
    return new vec4hImpl(x, y, z, w) as unknown as v4h;
  }
}

class vec4iImpl extends vec4Impl {
  readonly kind = 'vec4i';

  make2(x: number, y: number): v2i {
    return new vec2iImpl(x, y) as unknown as v2i;
  }

  make3(x: number, y: number, z: number): v3i {
    return new vec3iImpl(x, y, z) as unknown as v3i;
  }

  make4(x: number, y: number, z: number, w: number): v4i {
    return new vec4iImpl(x, y, z, w) as unknown as v4i;
  }
}

class vec4uImpl extends vec4Impl {
  readonly kind = 'vec4u';

  make2(x: number, y: number): v2u {
    return new vec2uImpl(x, y) as unknown as v2u;
  }

  make3(x: number, y: number, z: number): v3u {
    return new vec3uImpl(x, y, z) as unknown as v3u;
  }

  make4(x: number, y: number, z: number, w: number): v4u {
    return new vec4uImpl(x, y, z, w) as unknown as v4u;
  }
}

const vecProxyHandler: ProxyHandler<{ kind: VecKind }> = {
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
  | 'vec2h'
  | 'vec3f'
  | 'vec3i'
  | 'vec3u'
  | 'vec3h'
  | 'vec4f'
  | 'vec4i'
  | 'vec4u'
  | 'vec4h';

/**
 * Type of the `d.vec2f` object/function: vector data type schema/constructor
 */
export type NativeVec2f = Vec2f & { '~exotic': Vec2f } & ((
    x: number,
    y: number,
  ) => v2f) &
  ((xy: number) => v2f) &
  (() => v2f);

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
    new Proxy(new vec2fImpl(x, y), vecProxyHandler) as v2f,
  makeFromScalar: (x) => new Proxy(new vec2fImpl(x, x), vecProxyHandler) as v2f,
}) as NativeVec2f;

/**
 * Type of the `d.vec2h` object/function: vector data type schema/constructor
 */
export type NativeVec2h = Vec2h & { '~exotic': Vec2h } & ((
    x: number,
    y: number,
  ) => v2h) &
  ((xy: number) => v2h) &
  (() => v2h);

/**
 *
 * Schema representing vec2h - a vector with 2 elements of type f16.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec2h(); // (0.0, 0.0)
 * const vector = d.vec2h(1); // (1.0, 1.0)
 * const vector = d.vec2h(0.5, 0.1); // (0.5, 0.1)
 *
 * @example
 * const buffer = root.createBuffer(d.vec2h, d.vec2h(0, 1)); // buffer holding a d.vec2h value, with an initial value of vec2h(0, 1);
 */
export const vec2h = makeVecSchema({
  type: 'vec2h',
  length: 2,
  make: (x: number, y: number) =>
    new Proxy(new vec2hImpl(x, y), vecProxyHandler) as v2h,
  makeFromScalar: (x) => new Proxy(new vec2hImpl(x, x), vecProxyHandler) as v2h,
}) as NativeVec2h;

/**
 * Type of the `d.vec2i` object/function: vector data type schema/constructor
 */
export type NativeVec2i = Vec2i & { '~exotic': Vec2i } & ((
    x: number,
    y: number,
  ) => v2i) &
  ((xy: number) => v2i) &
  (() => v2i);

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
    new Proxy(new vec2iImpl(x, y), vecProxyHandler) as v2i,
  makeFromScalar: (x) => new Proxy(new vec2iImpl(x, x), vecProxyHandler) as v2i,
}) as NativeVec2i;

/**
 * Type of the `d.vec2u` object/function: vector data type schema/constructor
 */
export type NativeVec2u = Vec2u & { '~exotic': Vec2u } & ((
    x: number,
    y: number,
  ) => v2u) &
  ((xy: number) => v2u) &
  (() => v2u);

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
    new Proxy(new vec2uImpl(x, y), vecProxyHandler) as v2u,
  makeFromScalar: (x) => new Proxy(new vec2uImpl(x, x), vecProxyHandler) as v2u,
}) as NativeVec2u;

/**
 * Type of the `d.vec3f` object/function: vector data type schema/constructor
 */
export type NativeVec3f = Vec3f & { '~exotic': Vec3f } & ((
    x: number,
    y: number,
    z: number,
  ) => v3f) &
  ((xyz: number) => v3f) &
  (() => v3f);

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
  make: (x, y, z) => new Proxy(new vec3fImpl(x, y, z), vecProxyHandler) as v3f,
  makeFromScalar: (x) =>
    new Proxy(new vec3fImpl(x, x, x), vecProxyHandler) as v3f,
}) as NativeVec3f;

/**
 * Type of the `d.vec3h` object/function: vector data type schema/constructor
 */
export type NativeVec3h = Vec3h & { '~exotic': Vec3h } & ((
    x: number,
    y: number,
    z: number,
  ) => v3h) &
  ((xyz: number) => v3h) &
  (() => v3h);

/**
 *
 * Schema representing vec3h - a vector with 3 elements of type f16.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec3h(); // (0.0, 0.0, 0.0)
 * const vector = d.vec3h(1); // (1.0, 1.0, 1.0)
 * const vector = d.vec3h(1, 2, 3.5); // (1.0, 2.0, 3.5)
 *
 * @example
 * const buffer = root.createBuffer(d.vec3h, d.vec3h(0, 1, 2)); // buffer holding a d.vec3h value, with an initial value of vec3h(0, 1, 2);
 */
export const vec3h = makeVecSchema({
  type: 'vec3h',
  length: 3,
  make: (x, y, z) => new Proxy(new vec3hImpl(x, y, z), vecProxyHandler) as v3h,
  makeFromScalar: (x) =>
    new Proxy(new vec3hImpl(x, x, x), vecProxyHandler) as v3h,
}) as NativeVec3h;

/**
 * Type of the `d.vec3i` object/function: vector data type schema/constructor
 */
export type NativeVec3i = Vec3i & { '~exotic': Vec3i } & ((
    x: number,
    y: number,
    z: number,
  ) => v3i) &
  ((xyz: number) => v3i) &
  (() => v3i);

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
  make: (x, y, z) => new Proxy(new vec3iImpl(x, y, z), vecProxyHandler) as v3i,
  makeFromScalar: (x) =>
    new Proxy(new vec3iImpl(x, x, x), vecProxyHandler) as v3i,
}) as NativeVec3i;

/**
 * Type of the `d.vec3u` object/function: vector data type schema/constructor
 */
export type NativeVec3u = Vec3u & { '~exotic': Vec3u } & ((
    x: number,
    y: number,
    z: number,
  ) => v3u) &
  ((xyz: number) => v3u) &
  (() => v3u);

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
  make: (x, y, z) => new Proxy(new vec3uImpl(x, y, z), vecProxyHandler) as v3u,
  makeFromScalar: (x) =>
    new Proxy(new vec3uImpl(x, x, x), vecProxyHandler) as v3u,
}) as NativeVec3u;

/**
 * Type of the `d.vec4f` object/function: vector data type schema/constructor
 */
export type NativeVec4f = Vec4f & { '~exotic': Vec4f } & ((
    x: number,
    y: number,
    z: number,
    w: number,
  ) => v4f) &
  ((xyzw: number) => v4f) &
  (() => v4f);

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
    new Proxy(new vec4fImpl(x, y, z, w), vecProxyHandler) as v4f,
  makeFromScalar: (x) =>
    new Proxy(new vec4fImpl(x, x, x, x), vecProxyHandler) as v4f,
}) as NativeVec4f;

/**
 * Type of the `d.vec4h` object/function: vector data type schema/constructor
 */
export type NativeVec4h = Vec4h & { '~exotic': Vec4h } & ((
    x: number,
    y: number,
    z: number,
    w: number,
  ) => v4h) &
  ((xyzw: number) => v4h) &
  (() => v4h);

/**
 *
 * Schema representing vec4h - a vector with 4 elements of type f16.
 * Also a constructor function for this vector value.
 *
 * @example
 * const vector = d.vec4h(); // (0.0, 0.0, 0.0, 0.0)
 * const vector = d.vec4h(1); // (1.0, 1.0, 1.0, 1.0)
 * const vector = d.vec4h(1, 2, 3, 4.5); // (1.0, 2.0, 3.0, 4.5)
 *
 * @example
 * const buffer = root.createBuffer(d.vec4h, d.vec4h(0, 1, 2, 3)); // buffer holding a d.vec4h value, with an initial value of vec4h(0, 1, 2, 3);
 */
export const vec4h = makeVecSchema({
  type: 'vec4h',
  length: 4,
  make: (x, y, z, w) =>
    new Proxy(new vec4hImpl(x, y, z, w), vecProxyHandler) as v4h,
  makeFromScalar: (x) =>
    new Proxy(new vec4hImpl(x, x, x, x), vecProxyHandler) as v4h,
}) as NativeVec4h;

/**
 * Type of the `d.vec4i` object/function: vector data type schema/constructor
 */
export type NativeVec4i = Vec4i & { '~exotic': Vec4i } & ((
    x: number,
    y: number,
    z: number,
    w: number,
  ) => v4i) &
  ((xyzw: number) => v4i) &
  (() => v4i);

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
    new Proxy(new vec4iImpl(x, y, z, w), vecProxyHandler) as v4i,
  makeFromScalar: (x) =>
    new Proxy(new vec4iImpl(x, x, x, x), vecProxyHandler) as v4i,
}) as NativeVec4i;

/**
 * Type of the `d.vec4u` object/function: vector data type schema/constructor
 */
export type NativeVec4u = Vec4u & { '~exotic': Vec4u } & ((
    x: number,
    y: number,
    z: number,
    w: number,
  ) => v4u) &
  ((xyzw: number) => v4u) &
  (() => v4u);

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
    new Proxy(new vec4uImpl(x, y, z, w), vecProxyHandler) as v4u,
  makeFromScalar: (x) =>
    new Proxy(new vec4uImpl(x, x, x, x), vecProxyHandler) as v4u,
}) as NativeVec4u;
