import { createDualImpl } from '../shared/generators.ts';
import type { $repr } from '../shared/symbols.ts';
import { $internal } from '../shared/symbols.ts';
import type { SelfResolvable } from '../types.ts';
import { snip } from './dataTypes.ts';
import { vec2f, vec3f, vec4f } from './vector.ts';
import type {
  AnyWgslData,
  m2x2f,
  m3x3f,
  m4x4f,
  mat2x2,
  Mat2x2f,
  mat3x3,
  Mat3x3f,
  mat4x4,
  Mat4x4f,
  NumberArrayView,
  v2f,
  v3f,
  v4f,
  VecKind,
} from './wgslTypes.ts';

// --------------
// Implementation
// --------------

type vBase = {
  kind: VecKind;
  length: number;
  [n: number]: number;
};

export abstract class MatBase<TColumn> implements NumberArrayView {
  abstract readonly [$internal]: true;
  abstract readonly columns: readonly TColumn[];

  abstract readonly length: number;
  abstract [Symbol.iterator](): Iterator<number>;
  [n: number]: number;
}

interface MatSchemaOptions<TType extends string, ColumnType> {
  type: TType;
  rows: 2 | 3 | 4;
  columns: 2 | 3 | 4;
  MatImpl: new (...args: number[]) => MatBase<ColumnType>;
}

type MatConstructor<
  ValueType extends MatBase<ColumnType>,
  ColumnType extends vBase,
> = (...args: (number | ColumnType)[]) => ValueType;

function createMatSchema<
  TType extends string,
  ValueType extends MatBase<ColumnType>,
  ColumnType extends vBase,
>(
  options: MatSchemaOptions<TType, ColumnType>,
): { type: TType; [$repr]: ValueType } & MatConstructor<ValueType, ColumnType> {
  const MatSchema = {
    [$internal]: true,
    type: options.type,
    identity: identityFunctions[options.columns],
    translation: options.columns === 4 ? translation4 : undefined,
    scaling: options.columns === 4 ? scaling4 : undefined,
    rotationX: options.columns === 4 ? rotationX4 : undefined,
    rotationY: options.columns === 4 ? rotationY4 : undefined,
    rotationZ: options.columns === 4 ? rotationZ4 : undefined,
  } as unknown as AnyWgslData;

  const construct = createDualImpl(
    // CPU implementation
    (...args: (number | ColumnType)[]): ValueType => {
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

      if (
        elements.length !== 0 &&
        elements.length !== options.columns * options.rows
      ) {
        throw new Error(
          `'${options.type}' constructor called with invalid number of arguments.`,
        );
      }

      for (let i = elements.length; i < options.columns * options.rows; ++i) {
        elements.push(0);
      }

      return new options.MatImpl(...elements) as ValueType;
    },
    // GPU implementation
    (...args) =>
      snip(
        `${MatSchema.type}(${args.map((v) => v.value).join(', ')})`,
        MatSchema,
      ),
    MatSchema.type,
  );

  return Object.assign(construct, MatSchema) as unknown as {
    type: TType;
    [$repr]: ValueType;
  } & MatConstructor<ValueType, ColumnType>;
}

abstract class mat2x2Impl<TColumn extends v2f> extends MatBase<TColumn>
  implements mat2x2<TColumn>, SelfResolvable {
  public readonly [$internal] = true;
  public readonly columns: readonly [TColumn, TColumn];
  public readonly length = 4;
  public abstract readonly kind: string;
  [n: number]: number;

  constructor(...elements: number[]) {
    super();
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

  *[Symbol.iterator]() {
    yield this[0];
    yield this[1];
    yield this[2];
    yield this[3];
  }

  '~resolve'(): string {
    return `${this.kind}(${
      Array.from({ length: this.length })
        .map((_, i) => this[i])
        .join(', ')
    })`;
  }
}

class mat2x2fImpl extends mat2x2Impl<v2f> {
  public readonly kind = 'mat2x2f';

  makeColumn(e0: number, e1: number): v2f {
    return vec2f(e0, e1);
  }
}

abstract class mat3x3Impl<TColumn extends v3f> extends MatBase<TColumn>
  implements mat3x3<TColumn>, SelfResolvable {
  public readonly [$internal] = true;
  public readonly columns: readonly [TColumn, TColumn, TColumn];
  public readonly length = 12;
  public abstract readonly kind: string;
  [n: number]: number;

  constructor(...elements: number[]) {
    super();
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

  *[Symbol.iterator]() {
    for (let i = 0; i < 12; i++) {
      yield this[i] as number;
    }
  }

  '~resolve'(): string {
    return `${this.kind}(${this[0]}, ${this[1]}, ${this[2]}, ${this[4]}, ${
      this[5]
    }, ${this[6]}, ${this[8]}, ${this[9]}, ${this[10]})`;
  }
}

class mat3x3fImpl extends mat3x3Impl<v3f> {
  public readonly kind = 'mat3x3f';
  makeColumn(x: number, y: number, z: number): v3f {
    return vec3f(x, y, z);
  }
}

abstract class mat4x4Impl<TColumn extends v4f> extends MatBase<TColumn>
  implements mat4x4<TColumn>, SelfResolvable {
  public readonly [$internal] = true;
  public readonly columns: readonly [TColumn, TColumn, TColumn, TColumn];
  public abstract readonly kind: string;

  constructor(...elements: number[]) {
    super();
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

  *[Symbol.iterator]() {
    for (let i = 0; i < 16; i++) {
      yield this[i] as number;
    }
  }

  '~resolve'(): string {
    return `${this.kind}(${
      Array.from({ length: this.length })
        .map((_, i) => this[i])
        .join(', ')
    })`;
  }
}

class mat4x4fImpl extends mat4x4Impl<v4f> {
  public readonly kind = 'mat4x4f';

  makeColumn(x: number, y: number, z: number, w: number): v4f {
    return vec4f(x, y, z, w);
  }
}

// ----------
// Matrix ops
// ----------

/**
 * Returns a 2-by-2 identity matrix.
 * @returns {m2x2f} The result matrix.
 */
export const identity2 = createDualImpl(
  // CPU implementation
  () => mat2x2f(1, 0, 0, 1),
  // GPU implementation
  () => ({
    value: `mat4x4f(
      1.0, 0.0,
      0.0, 1.0
    )`,
    dataType: mat2x2f,
  }),
  'identity2',
);

/**
 * Returns a 3-by-3 identity matrix.
 * @returns {m3x3f} The result matrix.
 */
export const identity3 = createDualImpl(
  // CPU implementation
  () => mat3x3f(1, 0, 0, 0, 1, 0, 0, 0, 1),
  // GPU implementation
  () => ({
    value: `mat4x4f(
      1.0, 0.0, 0.0,
      0.0, 1.0, 0.0,
      0.0, 0.0, 1.0,
    )`,
    dataType: mat3x3f,
  }),
  'identity3',
);

/**
 * Returns a 4-by-4 identity matrix.
 * @returns {m4x4f} The result matrix.
 */
export const identity4 = createDualImpl(
  // CPU implementation
  () => mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1),
  // GPU implementation
  () => ({
    value: `mat4x4f(
      1.0, 0.0, 0.0, 0.0,
      0.0, 1.0, 0.0, 0.0,
      0.0, 0.0, 1.0, 0.0,
      0.0, 0.0, 0.0, 1.0
    )`,
    dataType: mat4x4f,
  }),
  'identity4',
);

const identityFunctions = {
  2: identity2,
  3: identity3,
  4: identity4,
};

/**
 * Creates a 4-by-4 matrix which translates by the given vector v.
 * @param {v3f} vector - The vector by which to translate.
 * @returns {m4x4f} The translation matrix.
 */
export const translation4 = createDualImpl(
  // CPU implementation
  (vector: v3f) =>
    // deno-fmt-ignore
    mat4x4f(
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      vector.x, vector.y, vector.z, 1,
    ),
  // GPU implementation
  (vector) => ({
    value: `mat4x4f(
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0, 
        ${vector.value}.x, ${vector.value}.y, ${vector.value}.z, 1
      )`,
    dataType: mat4x4f,
  }),
  'translation4',
);

/**
 * Creates a 4-by-4 matrix which scales in each dimension by an amount given by the corresponding entry in the given vector.
 * @param {v3f} vector - A vector of three entries specifying the factor by which to scale in each dimension.
 * @returns {m4x4f} The scaling matrix.
 */
export const scaling4 = createDualImpl(
  // CPU implementation
  (vector: v3f) =>
    // deno-fmt-ignore
    mat4x4f(
      vector.x, 0, 0, 0,
      0, vector.y, 0, 0,
      0, 0, vector.z, 0,
      0, 0, 0, 1,
    ),
  // GPU implementation
  (vector) => ({
    value: `mat4x4f(
        ${vector.value}.x, 0, 0, 0,
        0, ${vector.value}.y, 0, 0,
        0, 0, ${vector.value}.z, 0, 
        0, 0, 0, 1
      )`,
    dataType: mat4x4f,
  }),
  'scaling4',
);

/**
 * Creates a 4-by-4 matrix which rotates around the x-axis by the given angle.
 * @param {number} angle - The angle by which to rotate (in radians).
 * @returns {m4x4f} The rotation matrix.
 */
export const rotationX4 = createDualImpl(
  // CPU implementation
  (a: number) =>
    // deno-fmt-ignore
    mat4x4f(
      1, 0, 0, 0,
      0, Math.cos(a), Math.sin(a), 0,
      0, -Math.sin(a), Math.cos(a), 0,
      0, 0, 0, 1,
    ),
  // GPU implementation
  (a) =>
    snip(
      `mat4x4f(
        1, 0, 0, 0,
        0, cos(${a.value}), sin(${a.value}), 0,
        0, -sin(${a.value}), cos(${a.value}), 0,
        0, 0, 0, 1
      )`,
      mat4x4f,
    ),
  'rotationX4',
);

/**
 * Creates a 4-by-4 matrix which rotates around the y-axis by the given angle.
 * @param {number} angle - The angle by which to rotate (in radians).
 * @returns {m4x4f} The rotation matrix.
 */
export const rotationY4 = createDualImpl(
  // CPU implementation
  (a: number) =>
    // deno-fmt-ignore
    mat4x4f(
      Math.cos(a), 0, -Math.sin(a), 0,
      0, 1, 0, 0,
      Math.sin(a), 0, Math.cos(a), 0,
      0, 0, 0, 1,
    ),
  // GPU implementation
  (a) =>
    snip(
      `mat4x4f(
        cos(${a.value}), 0, -sin(${a.value}), 0,
        0, 1, 0, 0,
        sin(${a.value}), 0, cos(${a.value}), 0,
        0, 0, 0, 1
      )`,
      mat4x4f,
    ),
  'rotationY4',
);

/**
 * Creates a 4-by-4 matrix which rotates around the z-axis by the given angle.
 * @param {number} angle - The angle by which to rotate (in radians).
 * @returns {m4x4f} The rotation matrix.
 */
export const rotationZ4 = createDualImpl(
  // CPU implementation
  (a: number) =>
    // deno-fmt-ignore
    mat4x4f(
      Math.cos(a), Math.sin(a), 0, 0,
      -Math.sin(a), Math.cos(a), 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ),
  // GPU implementation
  (a) =>
    snip(
      `mat4x4f(
        cos(${a.value}), sin(${a.value}), 0, 0,
        -sin(${a.value}), cos(${a.value}), 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      )`,
      mat4x4f,
    ),
  'rotationZ4',
);

// ----------
// Public API
// ----------

/**
 * Schema representing mat2x2f - a matrix with 2 rows and 2 columns, with elements of type f32.
 * Also a constructor function for this matrix type.
 *
 * @example
 * const zero2x2 = mat2x2f(); // filled with zeros
 *
 * @example
 * const mat = mat2x2f(0, 1, 2, 3);
 * mat.columns[0] // vec2f(0, 1)
 * mat.columns[1] // vec2f(2, 3)
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
  MatImpl: mat2x2fImpl,
}) as Mat2x2f;

/**
 * Schema representing mat3x3f - a matrix with 3 rows and 3 columns, with elements of type f32.
 * Also a constructor function for this matrix type.
 *
 * @example
 * const zero3x3 = mat3x3f(); // filled with zeros
 *
 * @example
 * const mat = mat3x3f(0, 1, 2, 3, 4, 5, 6, 7, 8);
 * mat.columns[0] // vec3f(0, 1, 2)
 * mat.columns[1] // vec3f(3, 4, 5)
 * mat.columns[2] // vec3f(6, 7, 8)
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
  MatImpl: mat3x3fImpl,
}) as Mat3x3f;

/**
 * Schema representing mat4x4f - a matrix with 4 rows and 4 columns, with elements of type f32.
 * Also a constructor function for this matrix type.
 *
 * @example
 * const zero4x4 = mat4x4f(); // filled with zeros
 *
 * @example
 * const mat = mat4x4f(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
 * mat.columns[0] // vec4f(0, 1, 2, 3)
 * mat.columns[1] // vec4f(4, 5, 6, 7)
 * mat.columns[2] // vec4f(8, 9, 10, 11)
 * mat.columns[3] // vec4f(12, 13, 14, 15)
 *
 * @example
 * const mat = mat4x4f(
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
  MatImpl: mat4x4fImpl,
}) as Mat4x4f;

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
