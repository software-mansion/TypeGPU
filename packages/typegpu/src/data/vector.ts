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
import type { TgpuData } from '../types';
import alignIO from './alignIO';

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
  expressionCode: string;
};

function makeVecSchema<ValueType extends vecBase>(
  options: VecSchemaOptions<ValueType>,
): VecSchemaBase<ValueType> & ((...args: number[]) => ValueType) {
  const VecSchema: VecSchemaBase<ValueType> = {
    // Type-token, not available at runtime
    __unwrapped: undefined as unknown as ValueType,

    size: options.length * 4,
    label: options.label,
    byteAlignment: options.byteAlignment,
    expressionCode: options.label,

    resolveReferences(ctx: IRefResolver): void {
      throw new RecursiveDataTypeError();
    },

    write(output: ISerialOutput, value: Parsed<ValueType>): void {
      alignIO(output, this.byteAlignment);
      for (const element of value) {
        options.unitType.write(output, element);
      }
    },

    read(input: ISerialInput): Parsed<ValueType> {
      alignIO(input, this.byteAlignment);
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
      alignIO(measurer, this.byteAlignment);
      return measurer.add(this.size);
    },

    seekProperty(
      reference: Parsed<ValueType> | MaxValue,
      prop: never,
    ): { bufferOffset: number; schema: ISchema<unknown> } | null {
      throw new Error('Method not implemented.');
    },

    resolve(): string {
      return options.label;
    },
  };

  const construct = (...args: number[]): ValueType => {
    const values = args; // TODO: Allow users to pass in vectors that fill part of the values.

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

abstract class Swizzle2Impl<T2> {
  abstract make2(x: number, y: number): T2;

  abstract readonly x: number;
  abstract readonly y: number;

  get xx(): T2 {
    return this.make2(this.x, this.x);
  }

  get xy(): T2 {
    return this.make2(this.x, this.y);
  }

  get yx(): T2 {
    return this.make2(this.y, this.x);
  }

  get yy(): T2 {
    return this.make2(this.y, this.y);
  }
}

abstract class vec2Impl<T2> extends Swizzle2Impl<T2> implements vec2 {
  constructor(
    public x: number,
    public y: number,
  ) {
    super();
  }

  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
  }
}

class vec2fImpl extends vec2Impl<vec2f> implements vec2f {
  readonly kind = 'vec2f';

  make2(x: number, y: number): vec2f {
    return new vec2fImpl(x, y);
  }
}

class vec2iImpl extends vec2Impl<vec2i> implements vec2i {
  readonly kind = 'vec2i';

  make2(x: number, y: number): vec2i {
    return new vec2iImpl(x, y);
  }
}

class vec2uImpl extends vec2Impl<vec2u> implements vec2u {
  readonly kind = 'vec2u';

  make2(x: number, y: number): vec2u {
    return new vec2uImpl(x, y);
  }
}

abstract class Swizzle3Impl<T2, T3> extends Swizzle2Impl<T2> {
  abstract make3(x: number, y: number, z: number): T3;

  abstract readonly z: number;
}

abstract class vec3Impl<T2, T3> extends Swizzle3Impl<T2, T3> implements vec3 {
  constructor(
    public x: number,
    public y: number,
    public z: number,
  ) {
    super();
  }

  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
    yield this.z;
  }
}

class vec3fImpl extends vec3Impl<vec2f, vec3f> implements vec3f {
  readonly kind = 'vec3f';

  make2(x: number, y: number): vec2f {
    return new vec2fImpl(x, y);
  }

  make3(x: number, y: number, z: number): vec3f {
    return new vec3fImpl(x, y, z);
  }
}

class vec3iImpl extends vec3Impl<vec2i, vec3i> implements vec3i {
  readonly kind = 'vec3i';

  make2(x: number, y: number): vec2i {
    return new vec2iImpl(x, y);
  }

  make3(x: number, y: number, z: number): vec3i {
    return new vec3iImpl(x, y, z);
  }
}

class vec3uImpl extends vec3Impl<vec2u, vec3u> implements vec3u {
  readonly kind = 'vec3u';

  make2(x: number, y: number): vec2u {
    return new vec2uImpl(x, y);
  }

  make3(x: number, y: number, z: number): vec3u {
    return new vec3uImpl(x, y, z);
  }
}

abstract class Swizzle4Impl<T2, T3, T4> extends Swizzle3Impl<T2, T3> {
  abstract make4(x: number, y: number, z: number, w: number): T4;

  abstract readonly w: number;
}

abstract class vec4Impl<T2, T3, T4>
  extends Swizzle4Impl<T2, T3, T4>
  implements vec4
{
  constructor(
    public x: number,
    public y: number,
    public z: number,
    public w: number,
  ) {
    super();
  }

  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
    yield this.z;
    yield this.w;
  }
}

class vec4fImpl extends vec4Impl<vec2f, vec3f, vec4f> implements vec4f {
  readonly kind = 'vec4f';

  make2(x: number, y: number): vec2f {
    return new vec2fImpl(x, y);
  }

  make3(x: number, y: number, z: number): vec3f {
    return new vec3fImpl(x, y, z);
  }

  make4(x: number, y: number, z: number, w: number): vec4f {
    return new vec4fImpl(x, y, z, w);
  }
}

class vec4iImpl extends vec4Impl<vec2i, vec3i, vec4i> implements vec4i {
  readonly kind = 'vec4i';

  make2(x: number, y: number): vec2i {
    return new vec2iImpl(x, y);
  }

  make3(x: number, y: number, z: number): vec3i {
    return new vec3iImpl(x, y, z);
  }

  make4(x: number, y: number, z: number, w: number): vec4i {
    return new vec4iImpl(x, y, z, w);
  }
}

class vec4uImpl extends vec4Impl<vec2u, vec3u, vec4u> implements vec4u {
  readonly kind = 'vec4u';

  make2(x: number, y: number): vec2u {
    return new vec2uImpl(x, y);
  }

  make3(x: number, y: number, z: number): vec3u {
    return new vec3uImpl(x, y, z);
  }

  make4(x: number, y: number, z: number, w: number): vec4u {
    return new vec4uImpl(x, y, z, w);
  }
}

interface Swizzle2<T2> {
  readonly xx: T2; // TODO: Create setter
  readonly xy: T2; // TODO: Create setter
  readonly yx: T2; // TODO: Create setter
  readonly yy: T2; // TODO: Create setter
}

interface Swizzle3<T2, T3> extends Swizzle2<T2> {
  // TODO: Implement
}

interface Swizzle4<T2, T3, T4> extends Swizzle3<T2, T3> {
  // TODO: Implement
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

// ----------
// Public API
// ----------

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

export interface vecBase {
  kind: VecKind;
  [Symbol.iterator](): Iterator<number>;
}

export interface vec2f extends vec2, Swizzle2<vec2f> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec2f';
}
export interface vec2i extends vec2, Swizzle2<vec2i> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec2i';
}
export interface vec2u extends vec2, Swizzle2<vec2u> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec2u';
}

export interface vec3f extends vec3, Swizzle3<vec2f, vec3f> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec3f';
}
export interface vec3i extends vec3, Swizzle3<vec2i, vec3i> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec3i';
}
export interface vec3u extends vec3, Swizzle3<vec2u, vec3u> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec3u';
}

export interface vec4f extends vec4, Swizzle4<vec2f, vec3f, vec4f> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec4f';
}
export interface vec4i extends vec4, Swizzle4<vec2i, vec3i, vec4i> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec4i';
}
export interface vec4u extends vec4, Swizzle4<vec2u, vec3u, vec4u> {
  /** use to distinguish between vectors of the same size on the type level */
  kind: 'vec4u';
}

export type Vec2f = TgpuData<vec2f> &
  ((x: number, y: number) => vec2f) &
  ((xy: number) => vec2f) &
  (() => vec2f);

export const vec2f = makeVecSchema({
  unitType: f32,
  byteAlignment: 8,
  length: 2,
  label: 'vec2f',
  make: (x: number, y: number) => new vec2fImpl(x, y),
  makeFromScalar: (x) => new vec2fImpl(x, x),
}) as unknown as Vec2f;

export type Vec2i = TgpuData<vec2i> &
  ((x: number, y: number) => vec2i) &
  ((xy: number) => vec2i) &
  (() => vec2i);

export const vec2i = makeVecSchema({
  unitType: i32,
  byteAlignment: 8,
  length: 2,
  label: 'vec2i',
  make: (x: number, y: number) => new vec2iImpl(x, y),
  makeFromScalar: (x) => new vec2iImpl(x, x),
}) as unknown as Vec2i;

export type Vec2u = TgpuData<vec2u> &
  ((x: number, y: number) => vec2u) &
  ((xy: number) => vec2u) &
  (() => vec2u);

export const vec2u = makeVecSchema({
  unitType: u32,
  byteAlignment: 8,
  length: 2,
  label: 'vec2u',
  make: (x: number, y: number) => new vec2uImpl(x, y),
  makeFromScalar: (x) => new vec2uImpl(x, x),
}) as unknown as Vec2u;

export type Vec3f = TgpuData<vec3f> &
  ((x: number, y: number, z: number) => vec3f) &
  ((xyz: number) => vec3f) &
  (() => vec3f);

export const vec3f = makeVecSchema({
  unitType: f32,
  byteAlignment: 16,
  length: 3,
  label: 'vec3f',
  make: (x, y, z) => new vec3fImpl(x, y, z),
  makeFromScalar: (x) => new vec3fImpl(x, x, x),
}) as unknown as Vec3f;

export type Vec3i = TgpuData<vec3i> &
  ((x: number, y: number, z: number) => vec3i) &
  ((xyz: number) => vec3i) &
  (() => vec3i);

export const vec3i = makeVecSchema({
  unitType: i32,
  byteAlignment: 16,
  length: 3,
  label: 'vec3i',
  make: (x, y, z) => new vec3iImpl(x, y, z),
  makeFromScalar: (x) => new vec3iImpl(x, x, x),
}) as unknown as Vec3i;

export type Vec3u = TgpuData<vec3u> &
  ((x: number, y: number, z: number) => vec3u) &
  ((xyz: number) => vec3u) &
  (() => vec3u);

export const vec3u = makeVecSchema({
  unitType: u32,
  byteAlignment: 16,
  length: 3,
  label: 'vec3u',
  make: (x, y, z) => new vec3uImpl(x, y, z),
  makeFromScalar: (x) => new vec3uImpl(x, x, x),
}) as unknown as Vec3u;

export type Vec4f = TgpuData<vec4f> &
  ((x: number, y: number, z: number, w: number) => vec4f) &
  ((xyzw: number) => vec4f) &
  (() => vec4f);

export const vec4f = makeVecSchema({
  unitType: f32,
  byteAlignment: 16,
  length: 4,
  label: 'vec4f',
  make: (x, y, z, w) => new vec4fImpl(x, y, z, w),
  makeFromScalar: (x) => new vec4fImpl(x, x, x, x),
}) as unknown as Vec4f;

export type Vec4i = TgpuData<vec4i> &
  ((x: number, y: number, z: number, w: number) => vec4i) &
  ((xyzw: number) => vec4i) &
  (() => vec4i);

export const vec4i = makeVecSchema({
  unitType: i32,
  byteAlignment: 16,
  length: 4,
  label: 'vec4i',
  make: (x, y, z, w) => new vec4iImpl(x, y, z, w),
  makeFromScalar: (x) => new vec4iImpl(x, x, x, x),
}) as unknown as Vec4i;

export type Vec4u = TgpuData<vec4u> &
  ((x: number, y: number, z: number, w: number) => vec4u) &
  ((xyzw: number) => vec4u) &
  (() => vec4u);

export const vec4u = makeVecSchema({
  unitType: u32,
  byteAlignment: 16,
  length: 4,
  label: 'vec4u',
  make: (x, y, z, w) => new vec4uImpl(x, y, z, w),
  makeFromScalar: (x) => new vec4uImpl(x, x, x, x),
}) as unknown as Vec4u;
