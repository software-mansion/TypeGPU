import { vec2f, vec3f, vec4f, type vecBase } from './vector';
import type {
  $Mat2x2f,
  $Mat3x3f,
  $Mat4x4f,
  $Vec2f,
  $Vec3f,
  $Vec4f,
  Mat2x2f,
  Mat3x3f,
  Mat4x4f,
  mat2x2,
  mat3x3,
  mat4x4,
  matBase,
} from './wgslTypes';

// --------------
// Implementation
// --------------

interface MatSchemaOptions<TType extends string, ValueType> {
  type: TType;
  rows: number;
  columns: number;
  makeFromElements(...elements: number[]): ValueType;
}

type MatConstructor<
  ValueType extends matBase<ColumnType>,
  ColumnType extends vecBase,
> = (...args: (number | ColumnType)[]) => ValueType;

function createMatSchema<
  TType extends string,
  ValueType extends matBase<ColumnType>,
  ColumnType extends vecBase,
>(
  options: MatSchemaOptions<TType, ValueType>,
): { type: TType; __repr: ValueType } & MatConstructor<ValueType, ColumnType> {
  const MatSchema = {
    /** Type-token, not available at runtime */
    __repr: undefined as unknown as ValueType,
    type: options.type,
    label: options.type,
  };

  const construct = (...args: (number | ColumnType)[]): ValueType => {
    const elements: number[] = [];

    for (const arg of args) {
      if (typeof arg === 'number') {
        elements.push(arg);
      } else {
        for (let i = 0; i < arg.length; ++i) {
          elements.push(arg[i] as number);
        }
      }
    }

    // Fill the rest with zeros
    for (let i = elements.length; i < options.columns * options.rows; ++i) {
      elements.push(0);
    }

    return options.makeFromElements(...elements);
  };

  return Object.assign(construct, MatSchema) as unknown as {
    type: TType;
    __repr: ValueType;
  } & MatConstructor<ValueType, ColumnType>;
}

abstract class mat2x2Impl<TColumn extends $Vec2f> implements mat2x2<TColumn> {
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

class mat2x2fImpl extends mat2x2Impl<$Vec2f> implements $Mat2x2f {
  public readonly kind = 'mat2x2f';

  makeColumn(e0: number, e1: number): $Vec2f {
    return vec2f(e0, e1);
  }
}

abstract class mat3x3Impl<TColumn extends $Vec3f> implements mat3x3<TColumn> {
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

class mat3x3fImpl extends mat3x3Impl<$Vec3f> implements $Mat3x3f {
  public readonly kind = 'mat3x3f';
  makeColumn(x: number, y: number, z: number): $Vec3f {
    return vec3f(x, y, z);
  }
}

abstract class mat4x4Impl<TColumn extends $Vec4f> implements mat4x4<TColumn> {
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

class mat4x4fImpl extends mat4x4Impl<$Vec4f> implements $Mat4x4f {
  public readonly kind = 'mat4x4f';

  makeColumn(x: number, y: number, z: number, w: number): $Vec4f {
    return vec4f(x, y, z, w);
  }
}

// ----------
// Public API
// ----------

/**
 * Type of the `d.mat2x2f` object/function: matrix data type schema/constructor
 */
export type Mat2x2fConstructor = ((...elements: number[]) => $Mat2x2f) &
  ((...columns: $Vec2f[]) => $Mat2x2f) &
  (() => $Mat2x2f);

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
export const mat2x2f = createMatSchema<'mat2x2f', $Mat2x2f, $Vec2f>({
  type: 'mat2x2f',
  rows: 2,
  columns: 2,
  makeFromElements: (...elements: number[]) => new mat2x2fImpl(...elements),
}) as Mat2x2f & Mat2x2fConstructor;

/**
 * Type of the `d.mat3x3f` object/function: matrix data type schema/constructor
 */
export type Mat3x3fConstructor = ((...elements: number[]) => $Mat3x3f) &
  ((...columns: $Vec3f[]) => $Mat3x3f) &
  (() => $Mat3x3f);

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
export const mat3x3f = createMatSchema<'mat3x3f', $Mat3x3f, $Vec3f>({
  type: 'mat3x3f',
  rows: 3,
  columns: 3,
  makeFromElements: (...elements: number[]) => new mat3x3fImpl(...elements),
}) as Mat3x3f & Mat3x3fConstructor;

/**
 * Type of the `d.mat4x4f` object/function: matrix data type schema/constructor
 */
export type Mat4x4fConstructor = ((...elements: number[]) => $Mat4x4f) &
  ((...columns: $Vec4f[]) => $Mat4x4f) &
  (() => $Mat4x4f);

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
export const mat4x4f = createMatSchema<'mat4x4f', $Mat4x4f, $Vec4f>({
  type: 'mat4x4f',
  rows: 4,
  columns: 4,
  makeFromElements: (...elements: number[]) => new mat4x4fImpl(...elements),
}) as Mat4x4f & Mat4x4fConstructor;

export const mat2x2fToArray = (mat: $Mat2x2f): number[] =>
  [mat[0], mat[1], mat[2], mat[3]] as number[];

export const mat3x3fToArray = (mat: $Mat3x3f): number[] =>
  [
    mat[0],
    mat[1],
    mat[2],
    mat[4],
    mat[5],
    mat[6],
    mat[8],
    mat[9],
    mat[10],
  ] as number[];

export const mat4x4fToArray = (mat: $Mat4x4f): number[] =>
  Array.from({ length: mat.length }).map((_, idx) => mat[idx] as number);
