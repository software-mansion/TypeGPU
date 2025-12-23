import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const green = d.vec4f(
  0.11764705882352941,
  0.8392156862745098,
  0.5137254901960784,
  1,
);
const yellow = d.vec4f(
  0.8392156862745098,
  0.6470588235294118,
  0.11764705882352941,
  1,
);
const indigo = d.vec4f(
  0.3803921568627451,
  0.3333333333333333,
  0.9607843137254902,
  1,
);

const colors = [green, yellow, indigo];

const originalPositions = [
  d.vec2f(std.sqrt(3), -1),
  d.vec2f(0, 2),
  d.vec2f(-std.sqrt(3), -1),
];

const originalTriangleVertices = originalPositions.map((pos) =>
  std.mul(pos, 0.5),
);

const halvedTriangleVertexes = originalTriangleVertices.map((pos) =>
  std.mul(pos, 0.5),
);

const triangleVertices = [
  ...originalTriangleVertices, // the biggest outer static triangle
  ...originalTriangleVertices, // the middle triangle growing from half the size to full size
  ...halvedTriangleVertexes, // the smallest triangle growing from zero to half the size
];

export { colors, triangleVertices };
