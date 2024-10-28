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
import type { NumberArrayView, TgpuData } from '../types';
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
    isLoose: false as const,

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
      for (const col of value.columns) {
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

interface matBase<TColumn> extends NumberArrayView {
  readonly columns: readonly TColumn[];
  elements(): Iterable<number>;
}

abstract class mat2x2Impl<TColumn extends vec2f> implements mat2x2<TColumn> {
  public readonly columns: readonly [TColumn, TColumn];
  public readonly length = 4;
  [n: number]: number;

  constructor(...elements: number[]) {
    this.columns = [
      this.makeColumn(elements[0] as number, elements[1] as number),
      this.makeColumn(elements[2] as number, elements[3] as number),
    ];
  }

  abstract makeColumn(e0: number, e1: number): TColumn;

  *elements() {
    yield* this.columns[0];
    yield* this.columns[1];
  }

  get [0]() {
    return this.columns[0].x;
  }

  get [1]() {
    return this.columns[0].y;
  }

  get [2]() {
    return this.columns[1].x;
  }

  get [3]() {
    return this.columns[1].y;
  }

  set [0](value: number) {
    this.columns[0].x = value;
  }

  set [1](value: number) {
    this.columns[0].y = value;
  }

  set [2](value: number) {
    this.columns[1].x = value;
  }

  set [3](value: number) {
    this.columns[1].y = value;
  }
}

class mat2x2fImpl extends mat2x2Impl<vec2f> implements mat2x2f {
  makeColumn(e0: number, e1: number): vec2f {
    return vec2f(e0, e1);
  }
}

abstract class mat3x3Impl<TColumn extends vec3f> implements mat3x3<TColumn> {
  public readonly columns: readonly [TColumn, TColumn, TColumn];
  public readonly length = 12;
  [n: number]: number;

  constructor(...elements: number[]) {
    this.columns = [
      this.makeColumn(
        elements[0] as number,
        elements[1] as number,
        elements[2] as number,
      ),
      this.makeColumn(
        elements[3] as number,
        elements[4] as number,
        elements[5] as number,
      ),
      this.makeColumn(
        elements[6] as number,
        elements[7] as number,
        elements[8] as number,
      ),
    ];
  }

  abstract makeColumn(x: number, y: number, z: number): TColumn;

  *elements() {
    yield* this.columns[0];
    yield* this.columns[1];
    yield* this.columns[2];
  }

  get [0]() {
    return this.columns[0].x;
  }

  get [1]() {
    return this.columns[0].y;
  }

  get [2]() {
    return this.columns[0].z;
  }

  get [3]() {
    return 0;
  }

  get [4]() {
    return this.columns[1].x;
  }

  get [5]() {
    return this.columns[1].y;
  }

  get [6]() {
    return this.columns[1].z;
  }

  get [7]() {
    return 0;
  }

  get [8]() {
    return this.columns[2].x;
  }

  get [9]() {
    return this.columns[2].y;
  }

  get [10]() {
    return this.columns[2].z;
  }

  get [11]() {
    return 0;
  }

  set [0](value: number) {
    this.columns[0].x = value;
  }

  set [1](value: number) {
    this.columns[0].y = value;
  }

  set [2](value: number) {
    this.columns[0].z = value;
  }

  set [3](_: number) {}

  set [4](value: number) {
    this.columns[1].x = value;
  }

  set [5](value: number) {
    this.columns[1].y = value;
  }

  set [6](value: number) {
    this.columns[1].z = value;
  }

  set [7](_: number) {}

  set [8](value: number) {
    this.columns[2].x = value;
  }

  set [9](value: number) {
    this.columns[2].y = value;
  }

  set [10](value: number) {
    this.columns[2].z = value;
  }

  set [11](_: number) {}
}

class mat3x3fImpl extends mat3x3Impl<vec3f> implements mat3x3f {
  makeColumn(x: number, y: number, z: number): vec3f {
    return vec3f(x, y, z);
  }
}

abstract class mat4x4Impl<TColumn extends vec4f> implements mat4x4<TColumn> {
  public readonly columns: readonly [TColumn, TColumn, TColumn, TColumn];

  constructor(...elements: number[]) {
    this.columns = [
      this.makeColumn(
        elements[0] as number,
        elements[1] as number,
        elements[2] as number,
        elements[3] as number,
      ),
      this.makeColumn(
        elements[4] as number,
        elements[5] as number,
        elements[6] as number,
        elements[7] as number,
      ),
      this.makeColumn(
        elements[8] as number,
        elements[9] as number,
        elements[10] as number,
        elements[11] as number,
      ),
      this.makeColumn(
        elements[12] as number,
        elements[13] as number,
        elements[14] as number,
        elements[15] as number,
      ),
    ];
  }

  abstract makeColumn(x: number, y: number, z: number, w: number): TColumn;

  *elements() {
    yield* this.columns[0];
    yield* this.columns[1];
    yield* this.columns[2];
    yield* this.columns[3];
  }

  public readonly length = 16;
  [n: number]: number;

  get [0]() {
    return this.columns[0].x;
  }

  get [1]() {
    return this.columns[0].y;
  }

  get [2]() {
    return this.columns[0].z;
  }

  get [3]() {
    return this.columns[0].w;
  }

  get [4]() {
    return this.columns[1].x;
  }

  get [5]() {
    return this.columns[1].y;
  }

  get [6]() {
    return this.columns[1].z;
  }

  get [7]() {
    return this.columns[1].w;
  }

  get [8]() {
    return this.columns[2].x;
  }

  get [9]() {
    return this.columns[2].y;
  }

  get [10]() {
    return this.columns[2].z;
  }

  get [11]() {
    return this.columns[2].w;
  }

  get [12]() {
    return this.columns[3].x;
  }

  get [13]() {
    return this.columns[3].y;
  }

  get [14]() {
    return this.columns[3].z;
  }

  get [15]() {
    return this.columns[3].w;
  }

  set [0](value: number) {
    this.columns[0].x = value;
  }

  set [1](value: number) {
    this.columns[0].y = value;
  }

  set [2](value: number) {
    this.columns[0].z = value;
  }

  set [3](value: number) {
    this.columns[0].w = value;
  }

  set [4](value: number) {
    this.columns[1].x = value;
  }

  set [5](value: number) {
    this.columns[1].y = value;
  }

  set [6](value: number) {
    this.columns[1].z = value;
  }

  set [7](value: number) {
    this.columns[1].w = value;
  }

  set [8](value: number) {
    this.columns[2].x = value;
  }

  set [9](value: number) {
    this.columns[2].y = value;
  }

  set [10](value: number) {
    this.columns[2].z = value;
  }

  set [11](value: number) {
    this.columns[2].w = value;
  }

  set [12](value: number) {
    this.columns[3].x = value;
  }

  set [13](value: number) {
    this.columns[3].y = value;
  }

  set [14](value: number) {
    this.columns[3].z = value;
  }

  set [15](value: number) {
    this.columns[3].w = value;
  }
}

class mat4x4fImpl extends mat4x4Impl<vec4f> implements mat4x4f {
  makeColumn(x: number, y: number, z: number, w: number): vec4f {
    return vec4f(x, y, z, w);
  }
}

// ----------
// Public API
// ----------

/**
 * Interface representing its WGSL matrix type counterpart: mat2x2
 * A matrix with 2 rows and 2 columns, with elements of type `TColumn`
 */
interface mat2x2<TColumn> extends matBase<TColumn> {
  readonly length: 4;
  [n: number]: number;

  [0]: number;
  [1]: number;
  [2]: number;
  [3]: number;
}

/**
 * Interface representing its WGSL matrix type counterpart: mat2x2f or mat2x2<f32>
 * A matrix with 2 rows and 2 columns, with elements of type d.f32
 */
export interface mat2x2f extends mat2x2<vec2f> {}

/**
 * Type of the `d.mat2x2f` object/function: matrix data type schema/constructor
 */
export type Mat2x2f = TgpuData<mat2x2f> &
  ((...elements: number[]) => mat2x2f) &
  ((...columns: vec2f[]) => mat2x2f) &
  (() => mat2x2f);

/**
 *
 * Schema representing mat2x2f - a matrix with 2 rows and 2 columns, with elements of type f32.
 * Also a constructor function for this matrix type.
 *
 * @example
 * const zero2x2 = mat2x2f(); // filled with zeros
 *
 * @example
 * const mat = mat2x2f(0, 1, 2, 3);
 * mat[0] // vec2f(0, 1)
 * mat[1] // vec2f(2, 3)
 *
 * @example
 * const mat = mat2x2f(
 *  vec2f(0, 1), // column 0
 *  vec2f(1, 2), // column 1
 * );
 *
 * @example
 * const buffer = root.createBuffer(d.mat2x2f, d.mat2x2f(0, 1, 2, 3)); // buffer holding a d.mat2x2f value, with an initial value of ((0, 1), (2, 3))
 */
export const mat2x2f = createMatSchema({
  label: 'mat2x2f',
  columnType: vec2f,
  rows: 2,
  columns: 2,
  makeFromColumnVectors: (...columns: [vec2f, vec2f]) =>
    new mat2x2fImpl(...columns[0], ...columns[1]),
  makeFromElements: (...elements: number[]) => new mat2x2fImpl(...elements),
}) as Mat2x2f;

/**
 * Interface representing its WGSL matrix type counterpart: mat3x3
 * A matrix with 3 rows and 3 columns, with elements of type `TColumn`
 */
interface mat3x3<TColumn> extends matBase<TColumn> {
  readonly length: 12;
  [n: number]: number;

  [0]: number;
  [1]: number;
  [2]: number;
  [3]: number;
  [4]: number;
  [5]: number;
  [6]: number;
  [7]: number;
  [8]: number;
  [9]: number;
  [10]: number;
  [11]: number;
}

/**
 * Interface representing its WGSL matrix type counterpart: mat3x3f or mat3x3<f32>
 * A matrix with 3 rows and 3 columns, with elements of type d.f32
 */
export interface mat3x3f extends mat3x3<vec3f> {}

/**
 * Type of the `d.mat3x3f` object/function: matrix data type schema/constructor
 */
export type Mat3x3f = TgpuData<mat3x3f> &
  ((...elements: number[]) => mat3x3f) &
  ((...columns: vec3f[]) => mat3x3f) &
  (() => mat3x3f);

/**
 *
 * Schema representing mat3x3f - a matrix with 3 rows and 3 columns, with elements of type f32.
 * Also a constructor function for this matrix type.
 *
 * @example
 * const zero3x3 = mat3x3f(); // filled with zeros
 *
 * @example
 * const mat = mat3x3f(0, 1, 2, 3, 4, 5, 6, 7, 8);
 * mat[0] // vec3f(0, 1, 2)
 * mat[1] // vec3f(3, 4, 5)
 * mat[2] // vec3f(6, 7, 8)
 *
 * @example
 * const mat = mat3x3f(
 *  vec3f(0, 1, 2), // column 0
 *  vec3f(2, 3, 4), // column 1
 *  vec3f(5, 6, 7), // column 2
 * );
 *
 * @example
 * const buffer = root.createBuffer(d.mat3x3f, d.mat3x3f()); // buffer holding a d.mat3x3f value, with an initial value of mat3x3f filled with zeros
 */
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

/**
 * Interface representing its WGSL matrix type counterpart: mat4x4
 * A matrix with 4 rows and 4 columns, with elements of type `TColumn`
 */
interface mat4x4<TColumn> extends matBase<TColumn> {
  readonly length: 16;
  [n: number]: number;

  [0]: number;
  [1]: number;
  [2]: number;
  [3]: number;
  [4]: number;
  [5]: number;
  [6]: number;
  [7]: number;
  [8]: number;
  [9]: number;
  [10]: number;
  [11]: number;
  [12]: number;
  [13]: number;
  [14]: number;
  [15]: number;
}

/**
 * Interface representing its WGSL matrix type counterpart: mat4x4f or mat4x4<f32>
 * A matrix with 4 rows and 4 columns, with elements of type d.f32
 */
export interface mat4x4f extends mat4x4<vec4f> {}

/**
 * Type of the `d.mat4x4f` object/function: matrix data type schema/constructor
 */
export type Mat4x4f = TgpuData<mat4x4f> &
  ((...elements: number[]) => mat4x4f) &
  ((...columns: vec4f[]) => mat4x4f) &
  (() => mat4x4f);

/**
 *
 * Schema representing mat4x4f - a matrix with 4 rows and 4 columns, with elements of type f32.
 * Also a constructor function for this matrix type.
 *
 * @example
 * const zero4x4 = mat4x4f(); // filled with zeros
 *
 * @example
 * const mat = mat3x3f(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
 * mat[0] // vec4f(0, 1, 2, 3)
 * mat[1] // vec4f(4, 5, 6, 7)
 * mat[2] // vec4f(8, 9, 10, 11)
 * mat[3] // vec4f(12, 13, 14, 15)
 *
 * @example
 * const mat = mat3x3f(
 *  vec4f(0, 1, 2, 3),     // column 0
 *  vec4f(4, 5, 6, 7),     // column 1
 *  vec4f(8, 9, 10, 11),   // column 2
 *  vec4f(12, 13, 14, 15), // column 3
 * );
 *
 * @example
 * const buffer = root.createBuffer(d.mat4x4f, d.mat4x4f()); // buffer holding a d.mat4x4f value, with an initial value of mat4x4f filled with zeros
 */
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
