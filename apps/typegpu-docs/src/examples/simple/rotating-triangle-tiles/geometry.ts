import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const green = d.vec4f(0.117, 0.839, 0.513, 1);
const yellow = d.vec4f(0.839, 0.647, 0.117, 1);
const indigo = d.vec4f(0.38, 0.333, 0.96, 1);

const colors = [green, yellow, indigo];

const originalVertices = [
  d.vec2f(std.sqrt(3), -1),
  d.vec2f(0, 2),
  d.vec2f(-std.sqrt(3), -1),
];

const halvedVertices = originalVertices.map((pos) => std.mul(pos, 0.5));

const triangleVertices = [
  ...originalVertices, // the biggest outer static triangle
  ...originalVertices, // the middle triangle growing from half the size to full size
  ...halvedVertices, // the smallest triangle growing from zero to half the size
];

export { colors, triangleVertices };
