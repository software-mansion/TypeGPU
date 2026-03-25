import { stitch } from '../core/resolve/stitch.ts';
import {
  mat4x4f,
  rotationX4,
  rotationY4,
  rotationZ4,
  scaling4,
  translation4,
} from '../data/matrix.ts';
import type { m4x4f, v3f } from '../data/wgslTypes.ts';
import { dualImpl } from '../core/function/dualImpl.ts';
import { mul } from './operators.ts';
import { $gpuCallable } from '../shared/symbols.ts';
import { vec3f } from '../data/vector.ts';
import { f32 } from '../data/numeric.ts';

const gpuTranslation4 = translation4[$gpuCallable].call.bind(translation4);
const gpuScaling4 = scaling4[$gpuCallable].call.bind(scaling4);
const gpuRotationX4 = rotationX4[$gpuCallable].call.bind(rotationX4);
const gpuRotationY4 = rotationY4[$gpuCallable].call.bind(rotationY4);
const gpuRotationZ4 = rotationZ4[$gpuCallable].call.bind(rotationZ4);

/**
 * Translates the given 4-by-4 matrix by the given vector.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {v3f} vector - The vector by which to translate the matrix.
 * @returns {m4x4f} The translated matrix.
 */
export const translate4 = dualImpl({
  name: 'translate4',
  normalImpl: (matrix: m4x4f, vector: v3f) => mul(translation4(vector), matrix),
  signature: { argTypes: [mat4x4f, vec3f], returnType: mat4x4f },
  codegenImpl: (ctx, [matrix, vector]) => stitch`(${gpuTranslation4(ctx, [vector])} * ${matrix})`,
});

/**
 * Scales the given 4-by-4 matrix in each dimension by an amount given by the corresponding entry in the given vector.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {v3f} vector - A vector of three entries specifying the factor by which to scale in each dimension.
 * @returns {m4x4f} The scaled matrix.
 */
export const scale4 = dualImpl({
  name: 'scale4',
  normalImpl: (matrix: m4x4f, vector: v3f) => mul(scaling4(vector), matrix),
  signature: { argTypes: [mat4x4f, vec3f], returnType: mat4x4f },
  codegenImpl: (ctx, [matrix, vector]) => stitch`(${gpuScaling4(ctx, [vector])} * ${matrix})`,
});

const rotateSignature = { argTypes: [mat4x4f, f32], returnType: mat4x4f };

/**
 * Rotates the given 4-by-4 matrix around the x-axis by the given angle.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {number} angle - The angle by which to rotate (in radians).
 * @returns {m4x4f} The rotated matrix.
 */
export const rotateX4 = dualImpl({
  name: 'rotateX4',
  normalImpl: (matrix: m4x4f, angle: number) => mul(rotationX4(angle), matrix),
  signature: rotateSignature,
  codegenImpl: (ctx, [matrix, angle]) => stitch`(${gpuRotationX4(ctx, [angle])} * ${matrix})`,
});

/**
 * Rotates the given 4-by-4 matrix around the y-axis by the given angle.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {number} angle - The angle by which to rotate (in radians).
 * @returns {m4x4f} The rotated matrix.
 */
export const rotateY4 = dualImpl({
  name: 'rotateY4',
  normalImpl: (matrix: m4x4f, angle: number) => mul(rotationY4(angle), matrix),
  signature: rotateSignature,
  codegenImpl: (ctx, [matrix, angle]) => stitch`(${gpuRotationY4(ctx, [angle])} * ${matrix})`,
});

/**
 * Rotates the given 4-by-4 matrix around the z-axis by the given angle.
 * @param {m4x4f} matrix - The matrix to be modified.
 * @param {number} angle - The angle by which to rotate (in radians).
 * @returns {m4x4f} The rotated matrix.
 */
export const rotateZ4 = dualImpl({
  name: 'rotateZ4',
  normalImpl: (matrix: m4x4f, angle: number) => mul(rotationZ4(angle), matrix),
  signature: rotateSignature,
  codegenImpl: (ctx, [matrix, angle]) => stitch`(${gpuRotationZ4(ctx, [angle])} * ${matrix})`,
});
