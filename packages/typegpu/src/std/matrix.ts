import { type Snippet } from '../data/dataTypes.ts';
import { mat4x4f } from '../data/matrix.ts';
import { type m4x4f, type v3f } from '../data/wgslTypes.ts';
import { createDualImpl } from '../shared/generators.ts';
import { mul } from './numeric.ts';

/**
 * Translates the given 4-by-4 matrix by the given vector.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {v3f} vector - The vector by which to translate the matrix.
 * @returns {m4x4f} - The translated matrix.
 */
export const translate4 = createDualImpl(
  // CPU implementation
  (matrix: m4x4f, vector: v3f) => {
    return mul(mat4x4f.translation(vector), matrix);
  },
  // GPU implementation
  (matrix, vector) => ({
    value: `(${matrix.value} * ${
      (mat4x4f.translation(vector as unknown as v3f) as unknown as Snippet)
        .value
    })`,
    dataType: matrix.dataType,
  }),
);

/**
 * Scales the given 4-by-4 matrix in each dimension by an amount given by the corresponding entry in the given vector.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {v3f} vector - A vector of three entries specifying the factor by which to scale in each dimension.
 * @returns {m4x4f} - The scaled matrix.
 */
export const scale4 = createDualImpl(
  // CPU implementation
  (matrix: m4x4f, vector: v3f) => {
    return mul(mat4x4f.scaling(vector), matrix);
  },
  // GPU implementation
  (matrix, vector) => ({
    value: `(${matrix.value} * ${
      (mat4x4f.scaling(vector as unknown as v3f) as unknown as Snippet)
        .value
    })`,
    dataType: matrix.dataType,
  }),
);

/**
 * Rotates the given 4-by-4 matrix around the x-axis by the given angle.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {v3f} angle - The angle by which to rotate (in radians).
 * @returns {m4x4f} - The rotated matrix.
 */
export const rotateX = createDualImpl(
  // CPU implementation
  (matrix: m4x4f, angle: number) => {
    return mul(mat4x4f.rotationX(angle), matrix);
  },
  // GPU implementation
  (matrix, vector) => ({
    value: `(${matrix.value} * ${
      (mat4x4f.rotationX(vector as unknown as number) as unknown as Snippet)
        .value
    })`,
    dataType: matrix.dataType,
  }),
);

/**
 * Rotates the given 4-by-4 matrix around the y-axis by the given angle.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {v3f} angle - The angle by which to rotate (in radians).
 * @returns {m4x4f} - The rotated matrix.
 */
export const rotateY = createDualImpl(
  // CPU implementation
  (matrix: m4x4f, angle: number) => {
    return mul(mat4x4f.rotationY(angle), matrix);
  },
  // GPU implementation
  (matrix, vector) => ({
    value: `(${matrix.value} * ${
      (mat4x4f.rotationY(vector as unknown as number) as unknown as Snippet)
        .value
    })`,
    dataType: matrix.dataType,
  }),
);

/**
 * Rotates the given 4-by-4 matrix around the z-axis by the given angle.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {v3f} angle - The angle by which to rotate (in radians).
 * @returns {m4x4f} - The rotated matrix.
 */
export const rotateZ = createDualImpl(
  // CPU implementation
  (matrix: m4x4f, angle: number) => {
    return mul(mat4x4f.rotationZ(angle), matrix);
  },
  // GPU implementation
  (matrix, vector) => ({
    value: `(${matrix.value} * ${
      (mat4x4f.rotationZ(vector as unknown as number) as unknown as Snippet)
        .value
    })`,
    dataType: matrix.dataType,
  }),
);

export {
  identity2,
  identity3,
  identity4,
  rotationX,
  scaling4,
  translation4,
} from '../data/matrix.ts';
