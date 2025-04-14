import { mat4x4f } from '../data/matrix';
import type { m4x4f, v3f } from '../data/wgslTypes';
import { createDualImpl } from '../shared/generators';
import { mul } from './numeric';

/**
 * Translates a matrix by a given vector.
 * @param {m4x4f} matrix - The matrix to be translated.
 * @param {v3f} vector - The vector by which to translate the matrix.
 * @returns {m4x4f} - The translated matrix.
 */
export const translate = createDualImpl(
  // CPU implementation
  (matrix: m4x4f, vector: v3f) => {
    const { x, y, z } = vector;
    // biome-ignore format: matrix
    const v4 = mat4x4f(
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      x, y, z, 1,
    );
    return mul(matrix, v4);
  },
  // GPU implementation
  (matrix, vector) => {
    return {
      value: `${matrix.value} * mat4x4<f32>(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ${vector.value}.x, ${vector.value}.y, ${vector.value}.z, 1)`,
      dataType: matrix.dataType,
    };
  },
);

/**
 * Generates a 4x4 identity matrix.
 * @returns {m4x4f} - The identity matrix.
 */
export const identity = createDualImpl(
  // CPU implementation
  () => {
    // biome-ignore format: matrix
    return mat4x4f(
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    );
  },
  // GPU implementation
  () => ({
    value: `mat4x4<f32>(
      1.0, 0.0, 0.0, 0.0,
      0.0, 1.0, 0.0, 0.0,
      0.0, 0.0, 1.0, 0.0,
      0.0, 0.0, 0.0, 1.0
    )`,
    dataType: mat4x4f,
  }),
);
