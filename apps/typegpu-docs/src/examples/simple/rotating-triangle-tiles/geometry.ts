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

const BASE_TRIANGLE_SIDE = 3 / 2;
const BASE_TRIANGLE_CENTROID_TO_MIDPOINT_LENGTH = 0.5;
const BASE_TRIANGLE_HALF_HEIGHT = std.sqrt(3) * 0.5;

export {
  BASE_TRIANGLE_CENTROID_TO_MIDPOINT_LENGTH,
  BASE_TRIANGLE_HALF_HEIGHT,
  BASE_TRIANGLE_SIDE,
  colors,
  originalVertices,
};
