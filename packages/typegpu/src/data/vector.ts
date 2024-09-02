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
import { CallableImpl } from '../callable';
import { RecursiveDataTypeError } from '../errors';
import type { WgslData } from '../types';
import alignIO from './alignIO';

// --------------
// Implementation
// --------------

interface VecSchemaOptions<T> {
  unitType: ISchema<number>;
  byteAlignment: number;
  length: number;
  label: string;
  make: (...args: number[]) => T;
  makeFromScalar: (value: number | undefined) => T;
}

class VecSchemaImpl<T extends vecBase>
  extends CallableImpl<number[], T>
  implements WgslData<T>
{
  readonly __unwrapped!: T; // type-token, not available at runtime

  readonly unitType: ISchema<number>;
  readonly byteAlignment;
  readonly length;
  readonly size;
  readonly label;
  public get expressionCode() {
    return this.label;
  }
  readonly make: (...args: number[]) => T;
  readonly makeFromScalar: (value: number | undefined) => T;

  constructor({
    unitType,
    byteAlignment,
    length,
    label,
    make,
    makeFromScalar,
  }: VecSchemaOptions<T>) {
    super();
    this.unitType = unitType;
    this.byteAlignment = byteAlignment;
    this.length = length;
    this.size = length * 4;
    this.label = label;
    this.make = make;
    this.makeFromScalar = makeFromScalar;
  }

  _call(...args: number[]): T {
    const values = args; // TODO: Allow users to pass in vectors that fill part of the values.

    if (values.length <= 1) {
      return this.makeFromScalar(values[0]);
    }

    if (values.length === this.length) {
      return this.make(...values);
    }

    throw new Error(
      `'${this.label}' constructor called with invalid number of arguments.`,
    );
  }

  resolveReferences(ctx: IRefResolver): void {
    throw new RecursiveDataTypeError();
  }

  write(output: ISerialOutput, value: Parsed<T>): void {
    alignIO(output, this.byteAlignment);
    for (let idx = 0; idx < value.length; ++idx) {
      this.unitType.write(output, value.at(idx));
    }
  }

  read(input: ISerialInput): Parsed<T> {
    alignIO(input, this.byteAlignment);
    return this.make(
      ...Array.from({ length: this.length }).map((_) =>
        this.unitType.read(input),
      ),
    ) as Parsed<T>;
  }

  measure(
    _value: Parsed<T> | MaxValue,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    alignIO(measurer, this.byteAlignment);
    return measurer.add(this.size);
  }

  seekProperty(
    reference: Parsed<T> | MaxValue,
    prop: never,
  ): { bufferOffset: number; schema: ISchema<unknown> } | null {
    throw new Error('Method not implemented.');
  }

  resolve(): string {
    return this.label;
  }
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
  readonly length = 2;

  constructor(
    private _x: number,
    private _y: number,
  ) {
    super();
  }

  at(idx: 0 | 1): number {
    return idx === 0 ? this._x : this._y;
  }

  get x() {
    return this._x;
  }

  get y() {
    return this._y;
  }

  set x(value: number) {
    this._x = value;
  }

  set y(value: number) {
    this._y = value;
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
  readonly length = 3;

  constructor(
    private _x: number,
    private _y: number,
    private _z: number,
  ) {
    super();
  }

  at(idx: 0 | 1 | 2): number {
    return idx === 0 ? this._x : idx === 1 ? this._y : this._z;
  }

  get x() {
    return this._x;
  }

  get y() {
    return this._y;
  }

  get z() {
    return this._z;
  }

  set x(value: number) {
    this._x = value;
  }

  set y(value: number) {
    this._y = value;
  }

  set z(value: number) {
    this._z = value;
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
  readonly length = 4;

  constructor(
    private _x: number,
    private _y: number,
    private _z: number,
    private _w: number,
  ) {
    super();
  }

  at(idx: 0 | 1 | 2 | 3): number {
    return idx === 0
      ? this._x
      : idx === 1
        ? this._y
        : idx === 2
          ? this._z
          : this._w;
  }

  get x() {
    return this._x;
  }

  get y() {
    return this._y;
  }

  get z() {
    return this._z;
  }

  get w() {
    return this._w;
  }

  set x(value: number) {
    this._x = value;
  }

  set y(value: number) {
    this._y = value;
  }

  set z(value: number) {
    this._z = value;
  }

  set w(value: number) {
    this._w = value;
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
  length: 2;
  at(idx: 0 | 1): number;
}

interface vec3 {
  x: number;
  y: number;
  z: number;
  length: 3;
  at(idx: 0 | 1 | 2): number;
}

interface vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
  length: 4;
  at(idx: 0 | 1 | 2 | 3): number;
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
  length: number;
  at(idx: number): number;
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

export type Vec2f = WgslData<vec2f> &
  ((x: number, y: number) => vec2f) &
  ((xy: number) => vec2f) &
  (() => vec2f);

export const vec2f = new VecSchemaImpl({
  unitType: f32,
  byteAlignment: 8,
  length: 2,
  label: 'vec2f',
  make: (x: number, y: number) => new vec2fImpl(x, y),
  makeFromScalar: (x = 0) => new vec2fImpl(x, x),
}) as unknown as Vec2f;

export type Vec2i = WgslData<vec2i> &
  ((x: number, y: number) => vec2i) &
  ((xy: number) => vec2i) &
  (() => vec2i);

export const vec2i = new VecSchemaImpl({
  unitType: i32,
  byteAlignment: 8,
  length: 2,
  label: 'vec2i',
  make: (x: number, y: number) => new vec2iImpl(x, y),
  makeFromScalar: (x = 0) => new vec2iImpl(x, x),
}) as unknown as Vec2i;

export type Vec2u = WgslData<vec2u> &
  ((x: number, y: number) => vec2u) &
  ((xy: number) => vec2u) &
  (() => vec2u);

export const vec2u = new VecSchemaImpl({
  unitType: u32,
  byteAlignment: 8,
  length: 2,
  label: 'vec2u',
  make: (x: number, y: number) => new vec2uImpl(x, y),
  makeFromScalar: (x = 0) => new vec2uImpl(x, x),
}) as unknown as Vec2u;

export type Vec3f = WgslData<vec3f> &
  ((x: number, y: number, z: number) => vec3f) &
  ((xyz: number) => vec3f) &
  (() => vec3f);

export const vec3f = new VecSchemaImpl({
  unitType: f32,
  byteAlignment: 16,
  length: 3,
  label: 'vec3f',
  make: (x, y, z) => new vec3fImpl(x, y, z),
  makeFromScalar: (x = 0) => new vec3fImpl(x, x, x),
}) as unknown as Vec3f;

export type Vec3i = WgslData<vec3i> &
  ((x: number, y: number, z: number) => vec3i) &
  ((xyz: number) => vec3i) &
  (() => vec3i);

export const vec3i = new VecSchemaImpl({
  unitType: i32,
  byteAlignment: 16,
  length: 3,
  label: 'vec3i',
  make: (x, y, z) => new vec3iImpl(x, y, z),
  makeFromScalar: (x = 0) => new vec3iImpl(x, x, x),
}) as unknown as Vec3i;

export type Vec3u = WgslData<vec3u> &
  ((x: number, y: number, z: number) => vec3u) &
  ((xyz: number) => vec3u) &
  (() => vec3u);

export const vec3u = new VecSchemaImpl({
  unitType: u32,
  byteAlignment: 16,
  length: 3,
  label: 'vec3u',
  make: (x, y, z) => new vec3uImpl(x, y, z),
  makeFromScalar: (x = 0) => new vec3uImpl(x, x, x),
}) as unknown as Vec3u;

export type Vec4f = WgslData<vec4f> &
  ((x: number, y: number, z: number, w: number) => vec4f) &
  ((xyzw: number) => vec4f) &
  (() => vec4f);

export const vec4f = new VecSchemaImpl({
  unitType: f32,
  byteAlignment: 16,
  length: 4,
  label: 'vec4f',
  make: (x, y, z, w) => new vec4fImpl(x, y, z, w),
  makeFromScalar: (x = 0) => new vec4fImpl(x, x, x, x),
}) as unknown as Vec4f;

export type Vec4i = WgslData<vec4i> &
  ((x: number, y: number, z: number, w: number) => vec4i) &
  ((xyzw: number) => vec4i) &
  (() => vec4i);

export const vec4i = new VecSchemaImpl({
  unitType: i32,
  byteAlignment: 16,
  length: 4,
  label: 'vec4i',
  make: (x, y, z, w) => new vec4iImpl(x, y, z, w),
  makeFromScalar: (x = 0) => new vec4iImpl(x, x, x, x),
}) as unknown as Vec4i;

export type Vec4u = WgslData<vec4u> &
  ((x: number, y: number, z: number, w: number) => vec4u) &
  ((xyzw: number) => vec4u) &
  (() => vec4u);

export const vec4u = new VecSchemaImpl({
  unitType: u32,
  byteAlignment: 16,
  length: 4,
  label: 'vec4u',
  make: (x, y, z, w) => new vec4uImpl(x, y, z, w),
  makeFromScalar: (x = 0) => new vec4uImpl(x, x, x, x),
}) as unknown as Vec4u;
