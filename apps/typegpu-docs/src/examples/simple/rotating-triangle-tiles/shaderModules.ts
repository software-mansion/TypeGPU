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
  drawOverNeighborsBuffer,
  instanceInfoLayout,
  middleSquareScaleBuffer,
  shiftedColorsBuffer,
  stepRotationBuffer,
  triangleVerticesBuffer,
} from './buffers.ts';

//clear background color
const backgroundVertex = tgpu['~unstable'].vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
  },
  out: { outPos: d.builtin.position },
})(({ vertexIndex }) => {
  const positions = [
    d.vec2f(1, -1),
    d.vec2f(-1, 1),
    d.vec2f(-1, -1),
    d.vec2f(1, 1),
    d.vec2f(-1, 1),
    d.vec2f(1, -1),
  ];

  return {
    outPos: d.vec4f(positions[vertexIndex], 0, 1),
  };
});

const backgroundFragment = tgpu['~unstable'].fragmentFn({
  out: d.vec4f,
})(() => {
  const color = d.vec4f(shiftedColorsBuffer.$[0]);

  return color;
});

const MidgroundVertexOutput = {
  outPos: d.builtin.position,
  color: d.vec4f,
  maskP0: d.interpolate('flat', d.vec2f),
  maskP1: d.interpolate('flat', d.vec2f),
  maskP2: d.interpolate('flat', d.vec2f),
  worldPos: d.vec2f,
};

const midgroundVertex = tgpu['~unstable'].vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: MidgroundVertexOutput,
})(({ vertexIndex, instanceIndex }) => {
  const SMALLEST_LOOPING_ROTATION_ANGLE = d.f32(120);

  const vertexPosition = triangleVerticesBuffer.$.positions[vertexIndex];
  let calculatedPosition = d.vec2f(vertexPosition);

  const instanceInfo = instanceInfoLayout.$.instanceInfo[instanceIndex];

  const color = d.vec4f(shiftedColorsBuffer.$[1]);

  const angle = interpolateBezier(
    animationProgressUniform.$,
    stepRotationBuffer.$ % SMALLEST_LOOPING_ROTATION_ANGLE,
    stepRotationBuffer.$ +
      stepRotationBuffer.$ % SMALLEST_LOOPING_ROTATION_ANGLE,
  );

  const scaleFactor = interpolateBezier(
    animationProgressUniform.$,
    0.5,
    middleSquareScaleBuffer.$,
  );

  calculatedPosition = rotate(vertexPosition, angle);
  calculatedPosition = std.mul(calculatedPosition, scaleFactor);

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

function edgeFunction(a: d.v2f, b: d.v2f, p: d.v2f) {
  'use gpu';
  return (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
}

const midgroundFragment = tgpu['~unstable'].fragmentFn({
  in: MidgroundVertexOutput,
  out: d.vec4f,
})(({ color, maskP0, maskP1, maskP2, worldPos }) => {
  const e0 = edgeFunction(maskP0, maskP1, worldPos);
  const e1 = edgeFunction(maskP1, maskP2, worldPos);
  const e2 = edgeFunction(maskP2, maskP0, worldPos);

  if ((e0 > 0 || e1 > 0 || e2 > 0) && drawOverNeighborsBuffer.$ === 0) {
    std.discard();
  }

  return color;
});

const ForegroundVertexOutput = {
  outPos: d.builtin.position,
  color: d.vec4f,
};

// smallest triangle
const foregroundVertex = tgpu['~unstable'].vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: ForegroundVertexOutput,
})(({ vertexIndex, instanceIndex }) => {
  const vertexPosition = triangleVerticesBuffer.$.positions[vertexIndex + 6];
  let calculatedPosition = d.vec2f(vertexPosition);

  const instanceInfo = instanceInfoLayout.$.instanceInfo[instanceIndex];

  const color = d.vec4f(shiftedColorsBuffer.$[2]);

  const angle = interpolateBezier(
    animationProgressUniform.$,
    0,
    stepRotationBuffer.$,
  );

  const scaleFactor = animationProgressUniform.$;
  calculatedPosition = rotate(vertexPosition, angle);
  calculatedPosition = std.mul(calculatedPosition, scaleFactor);

  const finalPosition = instanceTransform(calculatedPosition, instanceInfo);

  return {
    outPos: d.vec4f(finalPosition, 0, 1),
    color,
  };
});

const foregroundFragment = tgpu['~unstable'].fragmentFn({
  in: ForegroundVertexOutput,
  out: d.vec4f,
})(({ color }) => {
  return color;
});

console.log('mainVertex:\n', tgpu.resolve([midgroundVertex]));
console.log('mainFragment:\n', tgpu.resolve([midgroundFragment]));

export {
  backgroundFragment,
  backgroundVertex,
  foregroundFragment,
  foregroundVertex,
  midgroundFragment,
  midgroundVertex,
};
