import tgpu from 'typegpu';
import { mat3x3f, vec3f } from 'typegpu/data';
import { mul } from 'typegpu/std';

/**
 * @example
 * import { rgbToYcbcrMatrix } from '@typegpu/color';
 *
 * const redInYcbcr = mul(d.vec3f(1, 0, 0), rgbToYcbcrMatrix);
 */
export const rgbToYcbcrMatrix = tgpu.const(
  mat3x3f,
  mat3x3f(
    // row 1
    0.299,
    0.587,
    0.114,
    // row 2
    -0.168736,
    -0.331264,
    0.5,
    // row 3
    0.5,
    -0.418688,
    -0.081312,
  ),
);

export const rgbToYcbcr = tgpu.fn([vec3f], vec3f)((rgb) =>
  mul(rgb, rgbToYcbcrMatrix.$)
);
