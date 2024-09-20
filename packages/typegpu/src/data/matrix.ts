import {
  type IMeasurer,
  type ISerialInput,
  type ISerialOutput,
  type MaxValue,
  Measurer,
  type Parsed,
} from 'typed-binary';
import { RecursiveDataTypeError } from '../errors';
import { roundUp } from '../mathUtils';
import type { TgpuData } from '../types';
import { vec2f, vec3f, vec4f, type vecBase } from './vector';

// --------------
// Implementation
// --------------

interface MatSchemaOptions<ValueType, ColumnType extends vecBase> {
  label: string;
  columnType: TgpuData<ColumnType>;
  rows: number;
  columns: number;
  makeFromColumnVectors(...columns: ColumnType[]): ValueType;
  makeFromElements(...elements: number[]): ValueType;
}

type MatSchema<
  ValueType extends matBase<ColumnType>,
  ColumnType extends vecBase,
> = TgpuData<ValueType> & ((...args: (number | ColumnType)[]) => ValueType);

function createMatSchema<
  ValueType extends matBase<ColumnType>,
  ColumnType extends vecBase,
>(
  options: MatSchemaOptions<ValueType, ColumnType>,
): MatSchema<ValueType, ColumnType> {
  const MatSchema: TgpuData<ValueType> = {
    // Type-token, not available at runtime.
    __unwrapped: undefined as unknown as ValueType,

    label: options.label,
    byteAlignment: options.columnType.byteAlignment,
    size: roundUp(
      options.columnType.size * options.columns,
      options.columnType.byteAlignment,
    ),

    resolveReferences() {
      throw new RecursiveDataTypeError();
    },

    write(output: ISerialOutput, value: Parsed<ValueType>): void {
      for (const col of value.columns()) {
        options.columnType.write(output, col as Parsed<ColumnType>);
      }
    },

    read(input: ISerialInput): Parsed<ValueType> {
      const columns = new Array(options.columns) as ColumnType[];

      for (let c = 0; c < options.columns; ++c) {
        columns[c] = options.columnType.read(input) as ColumnType;
      }

      return options.makeFromColumnVectors(...columns) as Parsed<ValueType>;
    },

    measure(_value: MaxValue, measurer: IMeasurer = new Measurer()): IMeasurer {
      return measurer.add(this.size);
    },

    seekProperty() {
      throw new Error('Method not implemented.');
    },

    resolve(): string {
      return options.label;
    },
  };

  const construct = (...args: (number | ColumnType)[]): ValueType => {
    const elements: number[] = [];

    for (const arg of args) {
      if (typeof arg === 'number') {
        elements.push(arg);
      } else {
        elements.push(...arg);
      }
    }

    // Fill the rest with zeros
    for (let i = elements.length; i < options.columns * options.rows; ++i) {
      elements.push(0);
    }

    return options.makeFromElements(...elements);
  };

  return Object.assign(construct, MatSchema);
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

export type Mat2x2f = TgpuData<mat2x2f> &
  ((...elements: number[]) => mat2x2f) &
  ((...columns: vec2f[]) => mat2x2f) &
  (() => mat2x2f);

export const mat2x2f = createMatSchema({
  label: 'mat2x2f',
  columnType: vec2f,
  rows: 2,
  columns: 2,
  makeFromColumnVectors: (...columns: [vec2f, vec2f]) =>
    new mat2x2fImpl(...columns[0], ...columns[1]),
  makeFromElements: (...elements: number[]) => new mat2x2fImpl(...elements),
}) as Mat2x2f;

export interface mat3x3<TColumn> extends matBase<TColumn> {
  [0]: TColumn;
  [1]: TColumn;
  [2]: TColumn;
  [idx: number]: TColumn | undefined;
}

export interface mat3x3f extends mat3x3<vec3f> {}

export type Mat3x3f = TgpuData<mat3x3f> &
  ((...elements: number[]) => mat3x3f) &
  ((...columns: vec3f[]) => mat3x3f) &
  (() => mat3x3f);

export const mat3x3f = createMatSchema({
  label: 'mat3x3f',
  columnType: vec3f,
  rows: 3,
  columns: 3,
  makeFromColumnVectors(...[v0, v1, v2]: [vec3f, vec3f, vec3f]) {
    return new mat3x3fImpl(...v0, ...v1, ...v2);
  },
  makeFromElements: (...elements: number[]) => new mat3x3fImpl(...elements),
}) as Mat3x3f;

export interface mat4x4<TColumn> extends matBase<TColumn> {
  [0]: TColumn;
  [1]: TColumn;
  [2]: TColumn;
  [3]: TColumn;
  [idx: number]: TColumn | undefined;
}

export interface mat4x4f extends mat4x4<vec4f> {}

export type Mat4x4f = TgpuData<mat4x4f> &
  ((...elements: number[]) => mat4x4f) &
  ((...columns: vec4f[]) => mat4x4f) &
  (() => mat4x4f);

export const mat4x4f = createMatSchema({
  label: 'mat4x4f',
  columnType: vec4f,
  rows: 4,
  columns: 4,
  makeFromColumnVectors(...[v0, v1, v2, v3]: [vec4f, vec4f, vec4f, vec4f]) {
    return new mat4x4fImpl(...v0, ...v1, ...v2, ...v3);
  },
  makeFromElements: (...elements: number[]) => new mat4x4fImpl(...elements),
}) as Mat4x4f;
