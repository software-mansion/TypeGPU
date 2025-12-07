import { stitch } from '../core/resolve/stitch.ts';
import { snip } from '../data/snippet.ts';
import {
  rotationX4,
  rotationY4,
  rotationZ4,
  scaling4,
  translation4,
} from '../data/matrix.ts';
import type { m4x4f, v3f } from '../data/wgslTypes.ts';
import { createDualImpl } from '../core/function/dualImpl.ts';
import { mul } from './operators.ts';
import { $internal } from '../shared/symbols.ts';

const cpuMul = mul[$internal].jsImpl;

const cpuTranslation4 = translation4[$internal].jsImpl;
const gpuTranslation4 = translation4[$internal].gpuImpl;

const cpuScaling4 = scaling4[$internal].jsImpl;
const gpuScaling4 = scaling4[$internal].gpuImpl;

const cpuRotationX4 = rotationX4[$internal].jsImpl;
const gpuRotationX4 = rotationX4[$internal].gpuImpl;

const cpuRotationY4 = rotationY4[$internal].jsImpl;
const gpuRotationY4 = rotationY4[$internal].gpuImpl;

const cpuRotationZ4 = rotationZ4[$internal].jsImpl;
const gpuRotationZ4 = rotationZ4[$internal].gpuImpl;

/**
 * Translates the given 4-by-4 matrix by the given vector.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {v3f} vector - The vector by which to translate the matrix.
 * @returns {m4x4f} The translated matrix.
 */
export const translate4 = createDualImpl(
  // CPU implementation
  (matrix: m4x4f, vector: v3f) => cpuMul(cpuTranslation4(vector), matrix),
  // GPU implementation
  (matrix, vector) =>
    snip(
      stitch`(${gpuTranslation4(vector)} * ${matrix})`,
      matrix.dataType,
      /* origin */ 'runtime',
    ),
  'translate4',
);

/**
 * Scales the given 4-by-4 matrix in each dimension by an amount given by the corresponding entry in the given vector.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {v3f} vector - A vector of three entries specifying the factor by which to scale in each dimension.
 * @returns {m4x4f} The scaled matrix.
 */
export const scale4 = createDualImpl(
  // CPU implementation
  (matrix: m4x4f, vector: v3f) => cpuMul(cpuScaling4(vector), matrix),
  // GPU implementation
  (matrix, vector) =>
    snip(
      stitch`(${(gpuScaling4(vector))} * ${matrix})`,
      matrix.dataType,
      /* origin */ 'runtime',
    ),
  'scale4',
);

/**
 * Rotates the given 4-by-4 matrix around the x-axis by the given angle.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {number} angle - The angle by which to rotate (in radians).
 * @returns {m4x4f} The rotated matrix.
 */
export const rotateX4 = createDualImpl(
  // CPU implementation
  (matrix: m4x4f, angle: number) => cpuMul(cpuRotationX4(angle), matrix),
  // GPU implementation
  (matrix, angle) =>
    snip(
      stitch`(${(gpuRotationX4(angle))} * ${matrix})`,
      matrix.dataType,
      /* origin */ 'runtime',
    ),
  'rotateX4',
);

/**
 * Rotates the given 4-by-4 matrix around the y-axis by the given angle.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {number} angle - The angle by which to rotate (in radians).
 * @returns {m4x4f} The rotated matrix.
 */
export const rotateY4 = createDualImpl(
  // CPU implementation
  (matrix: m4x4f, angle: number) => cpuMul(cpuRotationY4(angle), matrix),
  // GPU implementation
  (matrix, angle) =>
    snip(
      stitch`(${(gpuRotationY4(angle))} * ${matrix})`,
      matrix.dataType,
      /* origin */ 'runtime',
    ),
  'rotateY4',
);

/**
 * Rotates the given 4-by-4 matrix around the z-axis by the given angle.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {number} angle - The angle by which to rotate (in radians).
 * @returns {m4x4f} The rotated matrix.
 */
export const rotateZ4 = createDualImpl(
  // CPU implementation
  (matrix: m4x4f, angle: number) => cpuMul(cpuRotationZ4(angle), matrix),
  // GPU implementation
  (matrix, angle) =>
    snip(
      stitch`(${(gpuRotationZ4(angle))} * ${matrix})`,
      matrix.dataType,
      /* origin */ 'runtime',
    ),
  'rotateZ4',
);
