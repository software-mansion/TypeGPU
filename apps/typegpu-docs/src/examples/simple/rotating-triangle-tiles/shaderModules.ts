import tgpu from 'typegpu';
import * as std from 'typegpu/std';
import * as d from 'typegpu/data';
import {
  instanceTransform,
  interpolateBezier,
  rotate,
} from './transformations.ts';
import {
  animationProgressUniform,
  instanceInfoLayout,
  shiftedColorsBuffer,
  triangleVerticesBuffer,
} from './buffers.ts';
import { STEP_ROTATION_ANGLE } from './config.ts';

const MainVertexOutput = {
  outPos: d.builtin.position,
  color: d.vec4f,
  maskP0: d.interpolate('flat', d.vec2f),
  maskP1: d.interpolate('flat', d.vec2f),
  maskP2: d.interpolate('flat', d.vec2f),
  worldPos: d.vec2f,
};

function edgeFunction(a: d.v2f, b: d.v2f, p: d.v2f) {
  'use gpu';
  return (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
}

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: MainVertexOutput,
  out: d.vec4f,
})(({ color, maskP0, maskP1, maskP2, worldPos }) => {
  const e0 = edgeFunction(maskP0, maskP1, worldPos);
  const e1 = edgeFunction(maskP1, maskP2, worldPos);
  const e2 = edgeFunction(maskP2, maskP0, worldPos);

  if (e0 > 0 || e1 > 0 || e2 > 0) {
    std.discard();
  }

  return color;
});

const mainVertex = tgpu['~unstable'].vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: MainVertexOutput,
})(({ vertexIndex, instanceIndex }) => {
  const vertexPosition = triangleVerticesBuffer.$.positions[vertexIndex];
  let calculatedPosition = d.vec2f(vertexPosition);

  const instanceInfo = instanceInfoLayout.$.instanceInfo[instanceIndex];

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

  const finalPosition = instanceTransform(calculatedPosition, instanceInfo);

  // mask transform
  const maskP0 = instanceTransform(
    triangleVerticesBuffer.$.positions[0],
    instanceInfo,
  );
  const maskP1 = instanceTransform(
    triangleVerticesBuffer.$.positions[1],
    instanceInfo,
  );
  const maskP2 = instanceTransform(
    triangleVerticesBuffer.$.positions[2],
    instanceInfo,
  );

  return {
    outPos: d.vec4f(finalPosition, 0, 1),
    color,
    maskP0,
    maskP1,
    maskP2,
    worldPos: finalPosition,
  };
});

console.log('mainVertex:\n', tgpu.resolve([mainVertex]));
console.log('mainFragment:\n', tgpu.resolve([mainFragment]));

export { mainFragment, mainVertex };
