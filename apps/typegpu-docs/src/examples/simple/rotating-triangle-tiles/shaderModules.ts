import tgpu from 'typegpu';
import * as std from 'typegpu/std';
import * as d from 'typegpu/data';
import { interpolateBezier, rotate } from './transformations.ts';
import {
  animationProgressUniform,
  instanceInfoBuffer,
  shiftedColorsBuffer,
  triangleVerticesBuffer,
} from './buffers.ts';
import { SCALE, STEP_ROTATION_ANGLE } from './consts.ts';

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

  const instanceInfo = instanceInfoBuffer.$[instanceIndex];

  // biggest triangle
  let color = d.vec4f(shiftedColorsBuffer.$[0]);

  // middle triangle
  if (vertexIndex > 2 && vertexIndex < 6) {
    color = d.vec4f(shiftedColorsBuffer.$[1]);

    const angle = interpolateBezier(
      animationProgressUniform.$,
      STEP_ROTATION_ANGLE,
      STEP_ROTATION_ANGLE * 1.5,
    );
    const scaleFactor = interpolateBezier(
      animationProgressUniform.$,
      0.5,
      d.f32(2),
    );

    calculatedPosition = rotate(vertexPosition, angle);
    calculatedPosition = std.mul(calculatedPosition, scaleFactor);
  }

  // smallest triangle
  if (vertexIndex > 5) {
    color = d.vec4f(shiftedColorsBuffer.$[2]);

    const angle = interpolateBezier(
      animationProgressUniform.$,
      0,
      STEP_ROTATION_ANGLE,
    );
    const scaleFactor = animationProgressUniform.$;
    calculatedPosition = rotate(vertexPosition, angle);
    calculatedPosition = std.mul(calculatedPosition, scaleFactor);
  }

  // instance transform

  const finalPosition = std.add(
    rotate(std.mul(calculatedPosition, SCALE), instanceInfo.rotationAngle),
    instanceInfo.offset,
  );

  return { outPos: d.vec4f(finalPosition, 0, 1), color };
});

const maskVertex = tgpu['~unstable'].vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: { position: d.builtin.position },
})(({ vertexIndex, instanceIndex }) => {
  const instanceInfo = instanceInfoBuffer.$[instanceIndex];
  const vertexPosition = triangleVerticesBuffer.$.positions[vertexIndex];

  // instance transform
  const finalPosition = std.add(
    rotate(std.mul(vertexPosition, SCALE), instanceInfo.rotationAngle),
    instanceInfo.offset,
  );

  return { position: d.vec4f(finalPosition, 0, 1) };
});

console.log('mainVertex:\n', tgpu.resolve([mainVertex]));
console.log('mainFragment:\n', tgpu.resolve([mainFragment]));
console.log('maskVertex:\n', tgpu.resolve([maskVertex]));

export { mainFragment, mainVertex, maskVertex };
