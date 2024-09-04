// --------------
// Implementation
// --------------

import {
  type IMeasurer,
  type ISerialInput,
  type ISerialOutput,
  type MaxValue,
  Measurer,
  type Parsed,
} from 'typed-binary';
import { RecursiveDataTypeError } from '..';
import { CallableImpl } from '../callable';
import { roundUp } from '../mathUtils';
import type { WgslData } from '../types';
import alignIO from './alignIO';
import {
  vec2f,
  type vec2i,
  type vec2u,
  vec3f,
  type vec3i,
  type vec3u,
  vec4f,
  type vec4i,
  type vec4u,
  type vecBase,
} from './vector';

interface MatSchemaOptions<T, TVec extends vecBase> {
  label: string;
  columnType: WgslData<TVec>;
  rows: number;
  columns: number;
  makeFromColumnVectors(...columns: TVec[]): T;
  makeFromElements(...elements: number[]): T;
}

class MatSchemaImpl<T extends matBase<TColumn>, TColumn extends vecBase>
  extends CallableImpl<(number | TColumn)[], T>
  implements WgslData<T>
{
  public readonly __unwrapped!: T;

  private readonly _columnType: WgslData<TColumn>;
  private readonly _rows: number;
  private readonly _columns: number;
  private readonly _makeFromColumnVectors: (...columns: TColumn[]) => T;
  private readonly _makeFromElements: (...elements: number[]) => T;

  public readonly byteAlignment: number;
  public readonly size: number;
  public readonly label: string;

  constructor(options: MatSchemaOptions<T, TColumn>) {
    super();
    this._columnType = options.columnType;
    this._rows = options.rows;
    this._columns = options.columns;
    this.label = options.label;
    this._makeFromColumnVectors = options.makeFromColumnVectors;
    this._makeFromElements = options.makeFromElements;

    this.byteAlignment = this._columnType.byteAlignment;
    this.size = roundUp(
      this._columnType.size * this._columns,
      this.byteAlignment,
    );
  }

  _call(...args: (number | TColumn)[]): T {
    const elements: number[] = [];

    for (const arg of args) {
      if (typeof arg === 'number') {
        elements.push(arg);
      } else {
        elements.push(...arg);
      }
    }

    // Fill the rest with zeros
    for (let i = elements.length; i < this._columns * this._rows; ++i) {
      elements.push(0);
    }

    return this._makeFromElements(...elements);
  }

  resolveReferences(): void {
    throw new RecursiveDataTypeError();
  }

  write(output: ISerialOutput, value: Parsed<T>): void {
    for (const col of value.columns()) {
      this._columnType.write(output, col as Parsed<TColumn>);
    }
  }

  read(input: ISerialInput): Parsed<T> {
    const columns = new Array(this._columns) as TColumn[];

    for (let c = 0; c < this._columns; ++c) {
      columns[c] = this._columnType.read(input) as TColumn;
    }

    return this._makeFromColumnVectors(...columns) as Parsed<T>;
  }

  measure(_value: MaxValue, measurer: IMeasurer = new Measurer()): IMeasurer {
    alignIO(measurer, this.byteAlignment);
    return measurer.add(this.size);
  }

  seekProperty(): null {
    throw new Error('Method not implemented.');
  }

  resolve(): string {
    return this.label;
  }
}

interface matBase<TColumn> {
  columns(): Iterable<TColumn>;
  elements(): Iterable<number>;
}

abstract class mat2x2Impl<TColumn extends vecBase> implements mat2x2<TColumn> {
  private _columns = new Array(2) as [TColumn, TColumn];

  constructor(...elements: number[]) {
    this._columns[0] = this.makeColumn(
      elements[0] as number,
      elements[1] as number,
    );
    this._columns[1] = this.makeColumn(
      elements[2] as number,
      elements[3] as number,
    );
  }

  abstract makeColumn(e0: number, e1: number): TColumn;

  *columns() {
    yield this._columns[0];
    yield this._columns[1];
  }

  *elements() {
    yield* this._columns[0];
    yield* this._columns[1];
  }

  get [0]() {
    return this._columns[0];
  }

  get [1]() {
    return this._columns[1];
  }

  [idx: number]: TColumn | undefined;
}

class mat2x2fImpl extends mat2x2Impl<vec2f> implements mat2x2f {
  makeColumn(e0: number, e1: number): vec2f {
    return vec2f(e0, e1);
  }
}

abstract class mat3x3Impl<TColumn extends vecBase> implements mat3x3<TColumn> {
  private _columns = new Array(3) as [TColumn, TColumn, TColumn];

  constructor(...elements: number[]) {
    this._columns[0] = this.makeColumn(
      elements[0] as number,
      elements[1] as number,
      elements[2] as number,
    );
    this._columns[1] = this.makeColumn(
      elements[3] as number,
      elements[4] as number,
      elements[5] as number,
    );
    this._columns[2] = this.makeColumn(
      elements[6] as number,
      elements[7] as number,
      elements[8] as number,
    );
  }

  abstract makeColumn(x: number, y: number, z: number): TColumn;

  *columns() {
    yield this._columns[0];
    yield this._columns[1];
    yield this._columns[2];
  }

  *elements() {
    yield* this._columns[0];
    yield* this._columns[1];
    yield* this._columns[2];
  }

  get [0]() {
    return this._columns[0];
  }

  get [1]() {
    return this._columns[1];
  }

  get [2]() {
    return this._columns[2];
  }

  [idx: number]: TColumn | undefined;
}

class mat3x3fImpl extends mat3x3Impl<vec3f> implements mat3x3f {
  makeColumn(x: number, y: number, z: number): vec3f {
    return vec3f(x, y, z);
  }
}

abstract class mat4x4Impl<TColumn extends vecBase> implements mat4x4<TColumn> {
  private readonly _columns = new Array(4) as [
    TColumn,
    TColumn,
    TColumn,
    TColumn,
  ];

  constructor(...elements: number[]) {
    this._columns[0] = this.makeColumn(
      elements[0] as number,
      elements[1] as number,
      elements[2] as number,
      elements[3] as number,
    );
    this._columns[1] = this.makeColumn(
      elements[4] as number,
      elements[5] as number,
      elements[6] as number,
      elements[7] as number,
    );
    this._columns[2] = this.makeColumn(
      elements[8] as number,
      elements[9] as number,
      elements[10] as number,
      elements[11] as number,
    );
    this._columns[3] = this.makeColumn(
      elements[12] as number,
      elements[13] as number,
      elements[14] as number,
      elements[15] as number,
    );
  }

  abstract makeColumn(x: number, y: number, z: number, w: number): TColumn;

  *columns() {
    yield this._columns[0];
    yield this._columns[1];
    yield this._columns[2];
    yield this._columns[3];
  }

  *elements() {
    yield* this._columns[0];
    yield* this._columns[1];
    yield* this._columns[2];
    yield* this._columns[3];
  }

  get [0]() {
    return this._columns[0];
  }

  get [1]() {
    return this._columns[1];
  }

  get [2]() {
    return this._columns[2];
  }

  get [3]() {
    return this._columns[3];
  }

  [idx: number]: TColumn | undefined;
}

class mat4x4fImpl extends mat4x4Impl<vec4f> implements mat4x4f {
  makeColumn(x: number, y: number, z: number, w: number): vec4f {
    return vec4f(x, y, z, w);
  }
}

// ----------
// Public API
// ----------

export interface mat2x2<TColumn> extends matBase<TColumn> {
  [0]: TColumn;
  [1]: TColumn;
  [idx: number]: TColumn | undefined;
}

export interface mat2x2f extends mat2x2<vec2f> {}
export interface mat2x2i extends mat2x2<vec2i> {}
export interface mat2x2u extends mat2x2<vec2u> {}

export type Mat2x2f = WgslData<mat2x2f> &
  ((...elements: number[]) => mat2x2f) &
  ((...columns: vec2f[]) => mat2x2f) &
  (() => mat2x2f);

export const mat2x2f = new MatSchemaImpl({
  label: 'mat2x2f',
  columnType: vec2f,
  rows: 2,
  columns: 2,
  makeFromColumnVectors: (...columns: [vec2f, vec2f]) =>
    new mat2x2fImpl(...columns[0], ...columns[1]),
  makeFromElements: (...elements: number[]) => new mat2x2fImpl(...elements),
}) as unknown as Mat2x2f;

export interface mat3x3<TColumn> extends matBase<TColumn> {
  [0]: TColumn;
  [1]: TColumn;
  [2]: TColumn;
  [idx: number]: TColumn | undefined;
}

export interface mat3x3f extends mat3x3<vec3f> {}
export interface mat3x3i extends mat3x3<vec3i> {}
export interface mat3x3u extends mat3x3<vec3u> {}

export type Mat3x3f = WgslData<mat3x3f> &
  ((...elements: number[]) => mat3x3f) &
  ((...columns: vec3f[]) => mat3x3f) &
  (() => mat3x3f);

export const mat3x3f = new MatSchemaImpl({
  label: 'mat3x3f',
  columnType: vec3f,
  rows: 3,
  columns: 3,
  makeFromColumnVectors(...[v0, v1, v2]: [vec3f, vec3f, vec3f]) {
    return new mat3x3fImpl(...v0, ...v1, ...v2);
  },
  makeFromElements: (...elements: number[]) => new mat3x3fImpl(...elements),
}) as unknown as Mat3x3f;

export interface mat4x4<TColumn> extends matBase<TColumn> {
  [0]: TColumn;
  [1]: TColumn;
  [2]: TColumn;
  [3]: TColumn;
  [idx: number]: TColumn | undefined;
}

export interface mat4x4f extends mat4x4<vec4f> {}
export interface mat4x4i extends mat4x4<vec4i> {}
export interface mat4x4u extends mat4x4<vec4u> {}

export type Mat4x4f = WgslData<mat4x4f> &
  ((...elements: number[]) => mat4x4f) &
  ((...columns: vec4f[]) => mat4x4f) &
  (() => mat4x4f);

export const mat4x4f = new MatSchemaImpl({
  label: 'mat4x4f',
  columnType: vec4f,
  rows: 4,
  columns: 4,
  makeFromColumnVectors(...[v0, v1, v2, v3]: [vec4f, vec4f, vec4f, vec4f]) {
    return new mat4x4fImpl(...v0, ...v1, ...v2, ...v3);
  },
  makeFromElements: (...elements: number[]) => new mat4x4fImpl(...elements),
}) as unknown as Mat4x4f;
