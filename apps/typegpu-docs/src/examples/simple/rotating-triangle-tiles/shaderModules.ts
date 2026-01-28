import tgpu from 'typegpu';
import * as std from 'typegpu/std';
import * as d from 'typegpu/data';
import {
  instanceTransform,
  interpolateBezier,
  rotate,
} from './transformations.ts';
import { originalVertices } from './geometry.ts';
import {
  animationProgressAccess,
  aspectRatioAccess,
  drawOverNeighborsAccess,
  instanceInfoLayout,
  middleSquareScaleAccess,
  scaleAccess,
  shiftedColorsAccess,
  stepRotationAccess,
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
  const color = d.vec4f(shiftedColorsAccess.$[0]);

  return color;
});

const MidgroundVertexOutput = {
  outPos: d.builtin.position,
  maskP0: d.interpolate('flat', d.vec2f),
  maskP1: d.interpolate('flat', d.vec2f),
  maskP2: d.interpolate('flat', d.vec2f),
  vertexClipPos: d.vec2f,
};

const midgroundVertex = tgpu['~unstable'].vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: MidgroundVertexOutput,
})(({ vertexIndex, instanceIndex }) => {
  const SMALLEST_LOOPING_ROTATION_ANGLE = d.f32(120);

  const vertexPosition = d.vec2f(originalVertices.$[vertexIndex]);

  const instanceInfo = instanceInfoLayout.$.instanceInfo[instanceIndex];

  const angle = interpolateBezier(
    animationProgressAccess.$,
    stepRotationAccess.$ % SMALLEST_LOOPING_ROTATION_ANGLE,
    stepRotationAccess.$ +
      stepRotationAccess.$ % SMALLEST_LOOPING_ROTATION_ANGLE,
  );

  const scaleFactor = interpolateBezier(
    animationProgressAccess.$,
    0.5,
    middleSquareScaleAccess.$,
  );

  let calculatedPosition = rotate(vertexPosition, angle);
  calculatedPosition = std.mul(calculatedPosition, scaleFactor);

  const finalPosition = instanceTransform(
    calculatedPosition,
    instanceInfo,
    scaleAccess.$,
    aspectRatioAccess.$,
  );

  // mask transform
  const maskP0 = instanceTransform(
    d.vec2f(originalVertices.$[0]),
    instanceInfo,
    scaleAccess.$,
    aspectRatioAccess.$,
  );
  const maskP1 = instanceTransform(
    d.vec2f(originalVertices.$[1]),
    instanceInfo,
    scaleAccess.$,
    aspectRatioAccess.$,
  );
  const maskP2 = instanceTransform(
    d.vec2f(originalVertices.$[2]),
    instanceInfo,
    scaleAccess.$,
    aspectRatioAccess.$,
  );

  return {
    outPos: d.vec4f(finalPosition, 0, 1),
    maskP0,
    maskP1,
    maskP2,
    vertexClipPos: finalPosition,
  };
});

function edgeFunction(a: d.v2f, b: d.v2f, p: d.v2f) {
  'use gpu';
  return (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
}

const midgroundFragment = tgpu['~unstable'].fragmentFn({
  in: MidgroundVertexOutput,
  out: d.vec4f,
})(({ maskP0, maskP1, maskP2, vertexClipPos }) => {
  const e0 = edgeFunction(maskP0, maskP1, vertexClipPos);
  const e1 = edgeFunction(maskP1, maskP2, vertexClipPos);
  const e2 = edgeFunction(maskP2, maskP0, vertexClipPos);

  if ((e0 > 0 || e1 > 0 || e2 > 0) && drawOverNeighborsAccess.$ === 0) {
    std.discard();
  }

  const color = d.vec4f(shiftedColorsAccess.$[1]);

  return color;
});

// smallest triangle
const foregroundVertex = tgpu['~unstable'].vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: { outPos: d.builtin.position },
})(({ vertexIndex, instanceIndex }) => {
  const vertexPosition = d.vec2f(originalVertices.$[vertexIndex]);
  let calculatedPosition = d.mat2x2f(0.5, 0, 0, 0.5).mul(
    vertexPosition,
  );

  const instanceInfo = instanceInfoLayout.$.instanceInfo[instanceIndex];

  const angle = interpolateBezier(
    animationProgressAccess.$,
    0,
    stepRotationAccess.$,
  );

  const scaleFactor = animationProgressAccess.$;
  calculatedPosition = rotate(calculatedPosition, angle);
  calculatedPosition = std.mul(calculatedPosition, scaleFactor);

  const finalPosition = instanceTransform(
    calculatedPosition,
    instanceInfo,
    scaleAccess.$,
    aspectRatioAccess.$,
  );

  return {
    outPos: d.vec4f(finalPosition, 0, 1),
  };
});

const foregroundFragment = tgpu['~unstable'].fragmentFn({
  out: d.vec4f,
})(() => {
  const color = d.vec4f(shiftedColorsAccess.$[2]);

  return color;
});

export {
  backgroundFragment,
  backgroundVertex,
  foregroundFragment,
  foregroundVertex,
  midgroundFragment,
  midgroundVertex,
};
