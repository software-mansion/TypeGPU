import { type Snippet } from '../data/dataTypes.ts';
import { mat4x4f } from '../data/matrix.ts';
import { type m4x4f, type v3f } from '../data/wgslTypes.ts';
import { createDualImpl } from '../shared/generators.ts';
import { mul } from './numeric.ts';

/**
 * Translates a matrix by a given vector.
 * @param {m4x4f} matrix - The matrix to be translated.
 * @param {v3f} vector - The vector by which to translate the matrix.
 * @returns {m4x4f} - The translated matrix.
 */
export const translate4x4 = createDualImpl(
  // CPU implementation
  (matrix: m4x4f, vector: v3f) => {
    return mul(matrix, mat4x4f.translation(vector));
  },
  // GPU implementation
  (matrix, vector) => ({
    value: `(${matrix.value} * ${
      (mat4x4f.translation(
        vector as unknown as v3f,
      ) as unknown as Snippet).value
    })`,
    dataType: matrix.dataType,
  }),
);
