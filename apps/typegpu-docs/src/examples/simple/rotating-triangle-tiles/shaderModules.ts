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

const MidgroundVertexOutput = {
  outPos: d.builtin.position,
  maskP0: d.interpolate('flat', d.vec2f),
  maskP1: d.interpolate('flat', d.vec2f),
  maskP2: d.interpolate('flat', d.vec2f),
  vertexClipPos: d.vec2f,
};

/** draws middle triangle expanding to fill in the full base triangle */
const midgroundVertex = tgpu.vertexFn({
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

  const calculatedPosition = rotate(vertexPosition, angle).mul(scaleFactor);

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

function isOutsideMask(
  maskP0: d.v2f,
  maskP1: d.v2f,
  maskP2: d.v2f,
  vertexClipPos: d.v2f,
) {
  'use gpu';
  const e0 = edgeFunction(maskP0, maskP1, vertexClipPos);
  const e1 = edgeFunction(maskP1, maskP2, vertexClipPos);
  const e2 = edgeFunction(maskP2, maskP0, vertexClipPos);

  return (e0 > 0 || e1 > 0 || e2 > 0);
}

const midgroundFragment = tgpu.fragmentFn({
  in: MidgroundVertexOutput,
  out: d.vec4f,
})(({ maskP0, maskP1, maskP2, vertexClipPos }) => {
  if (
    drawOverNeighborsAccess.$ === 0 &&
    isOutsideMask(maskP0, maskP1, maskP2, vertexClipPos)
  ) {
    std.discard();
  }

  return d.vec4f(shiftedColorsAccess.$[1]);
});

/** the smallest triangle that appears from nothing and goes to half the size of the base triangle*/
const foregroundVertex = tgpu.vertexFn({
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
  calculatedPosition = rotate(calculatedPosition, angle).mul(scaleFactor);

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

const foregroundFragment = tgpu.fragmentFn({
  out: d.vec4f,
})(() => {
  const color = d.vec4f(shiftedColorsAccess.$[2]);

  return color;
});

export {
  foregroundFragment,
  foregroundVertex,
  midgroundFragment,
  midgroundVertex,
};
