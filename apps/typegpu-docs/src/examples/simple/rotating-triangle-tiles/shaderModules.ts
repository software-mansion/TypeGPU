import tgpu from 'typegpu';
import * as std from 'typegpu/std';
import * as d from 'typegpu/data';
import { interpolateBezier, rotate } from './transformations.ts';
import { triangleVertices } from './geometry.ts';
import { root } from './root.ts';
import { animationProgress, shiftedColors } from './buffers.ts';

const STEP_ROTATION_ANGLE = 60;
const SCALE = 0.5;

const TriangleVertices = d.struct({
  positions: d.arrayOf(d.vec2f, 9),
});

const triangleVerticesBuffer = root.createReadonly(TriangleVertices, {
  positions: triangleVertices,
});

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { color: d.vec4f },
  out: d.vec4f,
})((input) => {
  return input.color;
});

const mainVertex = tgpu['~unstable'].vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: { outPos: d.builtin.position, color: d.vec4f },
})(({ vertexIndex, instanceIndex }) => {
  const vertexPosition = triangleVerticesBuffer.$.positions[vertexIndex];
  let calculatedPosition = d.vec2f(vertexPosition);

  // biggest triangle
  let color = d.vec4f(shiftedColors.$[0]);

  // middle triangle
  if (vertexIndex > 2 && vertexIndex < 6) {
    color = d.vec4f(shiftedColors.$[1]);

    const angle = interpolateBezier(
      animationProgress.$,
      STEP_ROTATION_ANGLE,
      STEP_ROTATION_ANGLE * 1.5,
    );
    const scaleFactor = interpolateBezier(animationProgress.$, 0.5, d.f32(2));

    calculatedPosition = rotate(vertexPosition, angle);
    calculatedPosition = std.mul(calculatedPosition, scaleFactor);
  }

  // smallest triangle
  if (vertexIndex > 5) {
    color = d.vec4f(shiftedColors.$[2]);

    const angle = interpolateBezier(
      animationProgress.$,
      0,
      STEP_ROTATION_ANGLE,
    );
    const scaleFactor = animationProgress.$;
    calculatedPosition = rotate(vertexPosition, angle);
    calculatedPosition = std.mul(calculatedPosition, scaleFactor);
  }

  return { outPos: d.vec4f(std.mul(calculatedPosition, SCALE), 0, 1), color };
});

const maskVertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { position: d.builtin.position },
})(({ vertexIndex }) => {
  const vertexPosition = triangleVerticesBuffer.$.positions[vertexIndex];

  return { position: d.vec4f(std.mul(vertexPosition, SCALE), 0, 1) };
});

console.log('mainVertex:\n', tgpu.resolve([mainVertex]));
console.log('mainFragment:\n', tgpu.resolve([mainFragment]));
console.log('maskVertex:\n', tgpu.resolve([maskVertex]));

export { mainFragment, mainVertex, maskVertex };
