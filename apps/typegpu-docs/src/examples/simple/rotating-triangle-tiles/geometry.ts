import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import tgpu from 'typegpu';

const green = d.vec4f(0.117, 0.839, 0.513, 1);
const yellow = d.vec4f(0.839, 0.647, 0.117, 1);
const indigo = d.vec4f(0.38, 0.333, 0.96, 1);

const colors = [green, yellow, indigo];

const originalVertices = tgpu.const(d.arrayOf(d.vec2f, 3), [
  d.vec2f(std.sqrt(3) / 2, -0.5),
  d.vec2f(0, 1),
  d.vec2f(-std.sqrt(3) / 2, -0.5),
]);

const BASE_TRIANGLE_HEIGHT = 3 / 2;
const BASE_TRIANGLE_CENTROID_TO_MIDPOINT_LENGTH = 0.5;
const BASE_TRIANGLE_HALF_SIDE = std.sqrt(3) * 0.5;

/**
 * Scale factor that would make the base triangle fill
 * the full clip space when `tileDensity` is 1.
 *
 * Derivation:
 * - Original triangle takes 3/4 of the clip space's extent:
 *   `(CLIP_SPACE_EXTENT - BASE_TRIANGLE_HEIGHT) / CLIP_SPACE_EXTENT`
 * - `(2 - 1.5) / 2 = 0.5 / 2 = 3/4`
 * - So we need to scale it by the inverse of it, which is `4/3`, to reach full height.
 */
const MAGIC_NUMBER = 4 / 3;

export {
  BASE_TRIANGLE_CENTROID_TO_MIDPOINT_LENGTH,
  BASE_TRIANGLE_HALF_SIDE,
  BASE_TRIANGLE_HEIGHT,
  colors,
  MAGIC_NUMBER,
  originalVertices,
};
