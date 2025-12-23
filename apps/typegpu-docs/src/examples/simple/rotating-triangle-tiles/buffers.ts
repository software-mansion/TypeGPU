import * as d from 'typegpu/data';
import { colors } from './geometry.ts';
import { root } from './root.ts';
import { triangleVertices } from './geometry.ts';
import { instanceInfoArray, InstanceInfoArray } from './instanceInfo.ts';

const animationProgressUniform = root.createUniform(d.f32);

const shiftedColorsBuffer = root.createReadonly(d.arrayOf(d.vec4f, 3), [
  ...colors,
]);

const TriangleVertices = d.struct({
  positions: d.arrayOf(d.vec2f, 9),
});

const triangleVerticesBuffer = root.createReadonly(TriangleVertices, {
  positions: triangleVertices,
});

const instanceInfoBuffer = root.createReadonly(
  InstanceInfoArray,
  instanceInfoArray,
);

export {
  animationProgressUniform,
  shiftedColorsBuffer,
  instanceInfoBuffer,
  triangleVerticesBuffer,
};
