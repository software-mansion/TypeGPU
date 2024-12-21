import { type VecKind, vec2f, vec3f, vec4f } from './vector';
import type {
  Mat2x2f,
  Mat3x3f,
  Mat4x4f,
  m2x2f,
  m3x3f,
  m4x4f,
  mat2x2,
  mat3x3,
  mat4x4,
  matBase,
  v2f,
  v3f,
  v4f,
} from './wgslTypes';

// --------------
// Implementation
// --------------

type vBase = {
  kind: VecKind;
  length: number;
  [n: number]: number;
};

interface MatSchemaOptions<TType extends string, ValueType> {
  type: TType;
  rows: number;
  columns: number;
  makeFromElements(...elements: number[]): ValueType;
}

type MatConstructor<
  ValueType extends matBase<ColumnType>,
  ColumnType extends vBase,
> = (...args: (number | ColumnType)[]) => ValueType;

function createMatSchema<
  TType extends string,
  ValueType extends matBase<ColumnType>,
  ColumnType extends vBase,
>(
  options: MatSchemaOptions<TType, ValueType>,
): { type: TType; '~repr': ValueType } & MatConstructor<ValueType, ColumnType> {
  const MatSchema = {
    /** Type-token, not available at runtime */
    '~repr': undefined as unknown as ValueType,
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
    '~repr': ValueType;
  } & MatConstructor<ValueType, ColumnType>;
}

abstract class mat2x2Impl<TColumn extends v2f> implements mat2x2<TColumn> {
  public readonly columns: readonly [TColumn, TColumn];
  public readonly length = 4;
  public abstract readonly kind: string;
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

  resolve(): string {
    return `${this.kind}(${Array.from({ length: this.length })
      .map((_, i) => this[i])
      .join(', ')})`;
  }
}

class mat2x2fImpl extends mat2x2Impl<v2f> implements m2x2f {
  public readonly kind = 'mat2x2f';

  makeColumn(e0: number, e1: number): v2f {
    return vec2f(e0, e1);
  }
}

abstract class mat3x3Impl<TColumn extends v3f> implements mat3x3<TColumn> {
  public readonly columns: readonly [TColumn, TColumn, TColumn];
  public readonly length = 12;
  public abstract readonly kind: string;
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

  resolve(): string {
    return `${this.kind}(${Array.from({ length: this.length })
      .map((_, i) => this[i])
      .join(', ')})`;
  }
}

class mat3x3fImpl extends mat3x3Impl<v3f> implements m3x3f {
  public readonly kind = 'mat3x3f';
  makeColumn(x: number, y: number, z: number): v3f {
    return vec3f(x, y, z);
  }
}

abstract class mat4x4Impl<TColumn extends v4f> implements mat4x4<TColumn> {
  public readonly columns: readonly [TColumn, TColumn, TColumn, TColumn];
  public abstract readonly kind: string;

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

  resolve(): string {
    return `${this.kind}(${Array.from({ length: this.length })
      .map((_, i) => this[i])
      .join(', ')})`;
  }
}

class mat4x4fImpl extends mat4x4Impl<v4f> implements m4x4f {
  public readonly kind = 'mat4x4f';

  makeColumn(x: number, y: number, z: number, w: number): v4f {
    return vec4f(x, y, z, w);
  }
}

// ----------
// Public API
// ----------

/**
 * Type of the `d.mat2x2f` object/function: matrix data type schema/constructor
 */
export type NativeMat2x2f = Mat2x2f & { '~exotic': Mat2x2f } & ((
    ...elements: number[]
  ) => m2x2f) &
  ((...columns: v2f[]) => m2x2f) &
  (() => m2x2f);

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
export const mat2x2f = createMatSchema<'mat2x2f', m2x2f, v2f>({
  type: 'mat2x2f',
  rows: 2,
  columns: 2,
  makeFromElements: (...elements: number[]) => new mat2x2fImpl(...elements),
}) as NativeMat2x2f;

/**
 * Type of the `d.mat3x3f` object/function: matrix data type schema/constructor
 */
export type NativeMat3x3f = Mat3x3f & { '~exotic': Mat3x3f } & ((
    ...elements: number[]
  ) => m3x3f) &
  ((...columns: v3f[]) => m3x3f) &
  (() => m3x3f);

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
export const mat3x3f = createMatSchema<'mat3x3f', m3x3f, v3f>({
  type: 'mat3x3f',
  rows: 3,
  columns: 3,
  makeFromElements: (...elements: number[]) => new mat3x3fImpl(...elements),
}) as NativeMat3x3f;

/**
 * Type of the `d.mat4x4f` object/function: matrix data type schema/constructor
 */
export type NativeMat4x4f = Mat4x4f & { '~exotic': Mat4x4f } & ((
    ...elements: number[]
  ) => m4x4f) &
  ((...columns: v4f[]) => m4x4f) &
  (() => m4x4f);

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
export const mat4x4f = createMatSchema<'mat4x4f', m4x4f, v4f>({
  type: 'mat4x4f',
  rows: 4,
  columns: 4,
  makeFromElements: (...elements: number[]) => new mat4x4fImpl(...elements),
}) as NativeMat4x4f;

export function matToArray(mat: m2x2f | m3x3f | m4x4f): number[] {
  if (mat.kind === 'mat3x3f') {
    return [
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
  }

  return Array.from({ length: mat.length }).map((_, idx) => mat[idx] as number);
}
