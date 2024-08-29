import {
  type IMeasurer,
  type IRefResolver,
  type ISchema,
  type ISerialInput,
  type ISerialOutput,
  type MaxValue,
  Measurer,
  type Parsed,
} from 'typed-binary';
import { CallableImpl } from '../callable';
import { RecursiveDataTypeError } from '../errors';
import type { WgslData } from '../types';
import alignIO from './alignIO';

// --------------
// Implementation
// --------------

interface VecSchemaOptions<T> {
  byteAlignment: number;
  length: number;
  label: string;
  make: (...args: number[]) => T;
}

class VecfSchemaImpl<T extends vecBase>
  extends CallableImpl<number[], T>
  implements WgslData<T>
{
  readonly __unwrapped!: T; // type-token, not available at runtime

  readonly byteAlignment;
  readonly length;
  readonly size;
  readonly label;
  public get expressionCode() {
    return this.label;
  }
  readonly make: (...args: number[]) => T;

  constructor({ byteAlignment, length, label, make }: VecSchemaOptions<T>) {
    super();
    this.byteAlignment = byteAlignment;
    this.length = length;
    this.size = length * 4;
    this.label = label;
    this.make = make;
  }

  _call(...args: number[]): T {
    return this.make(...args);
  }

  resolveReferences(ctx: IRefResolver): void {
    throw new RecursiveDataTypeError();
  }

  write(output: ISerialOutput, value: Parsed<T>): void {
    alignIO(output, this.byteAlignment);
    for (let idx = 0; idx < value.length; ++idx) {
      output.writeFloat32(value.at(idx));
    }
  }

  read(input: ISerialInput): Parsed<T> {
    alignIO(input, this.byteAlignment);
    return this.make(
      ...Array.from({ length: this.length }).map((_) => input.readFloat32()),
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

class vec2fImpl implements vec2f {
  readonly length = 2;

  constructor(
    private _x: number,
    private _y: number,
  ) {}

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

  get xx(): vec2f {
    return new vec2fImpl(this._x, this._x);
  }

  get xy(): vec2f {
    return new vec2fImpl(this._x, this._y);
  }

  get yx(): vec2f {
    return new vec2fImpl(this._y, this._x);
  }

  get yy(): vec2f {
    return new vec2fImpl(this._y, this._y);
  }
}

class vec3fImpl implements vec3f {
  readonly length = 3;

  constructor(
    private _x: number,
    private _y: number,
    private _z: number,
  ) {}

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

class vec4fImpl implements vec4f {
  readonly length = 4;

  constructor(
    private _x: number,
    private _y: number,
    private _z: number,
    private _w: number,
  ) {}

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

// ----------
// Public API
// ----------

export interface vecBase {
  length: number;
  at(idx: number): number;
}

export interface vec2f {
  x: number;
  y: number;
  length: 2;
  at(idx: 0 | 1): number;
  readonly xx: vec2f; // TODO: Create setter
  readonly xy: vec2f; // TODO: Create setter
  readonly yx: vec2f; // TODO: Create setter
  readonly yy: vec2f; // TODO: Create setter
}

export interface vec3f {
  x: number;
  y: number;
  z: number;
  length: 3;
  at(idx: 0 | 1 | 2): number;
}

export interface vec4f {
  x: number;
  y: number;
  z: number;
  w: number;
  length: 4;
  at(idx: 0 | 1 | 2 | 3): number;
}

export type Vec2f = WgslData<vec2f> &
  ((x: number, y: number) => vec2f) &
  ((xy: number) => vec2f) &
  (() => vec2f);

export const vec2f = new VecfSchemaImpl({
  byteAlignment: 8,
  length: 2,
  label: 'vec2f',
  make: (...args: number[]) => {
    const x = args[0];
    const y = args[1];
    return x !== undefined && y !== undefined
      ? new vec2fImpl(x, y)
      : x !== undefined
        ? new vec2fImpl(x, x)
        : new vec2fImpl(0, 0);
  },
}) as unknown as Vec2f;

export type Vec3f = WgslData<vec3f> &
  ((x: number, y: number, z: number) => vec3f) &
  ((xyz: number) => vec3f) &
  (() => vec3f);

export const vec3f = new VecfSchemaImpl({
  byteAlignment: 16,
  length: 3,
  label: 'vec3f',
  make: (...args: number[]) => {
    const x = args[0];
    const y = args[1];
    const z = args[2];
    return x !== undefined && y !== undefined && z !== undefined
      ? new vec3fImpl(x, y, z)
      : x !== undefined
        ? new vec3fImpl(x, x, x)
        : new vec3fImpl(0, 0, 0);
  },
}) as unknown as Vec3f;

export type Vec4f = WgslData<vec4f> &
  ((x: number, y: number, z: number, w: number) => vec4f) &
  ((xyzw: number) => vec4f) &
  (() => vec4f);

export const vec4f = new VecfSchemaImpl({
  byteAlignment: 16,
  length: 4,
  label: 'vec4f',
  make: (...args: number[]) => {
    const x = args[0];
    const y = args[1];
    const z = args[2];
    const w = args[2];
    return x !== undefined &&
      y !== undefined &&
      z !== undefined &&
      w !== undefined
      ? new vec4fImpl(x, y, z, w)
      : x !== undefined
        ? new vec4fImpl(x, x, x, x)
        : new vec4fImpl(0, 0, 0, 0);
  },
}) as unknown as Vec4f;
