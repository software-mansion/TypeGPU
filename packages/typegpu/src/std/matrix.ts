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

export { scaling4, translation4 } from '../data/matrix.ts';
