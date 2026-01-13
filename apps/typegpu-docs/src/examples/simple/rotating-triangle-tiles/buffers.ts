import * as d from 'typegpu/data';
import tgpu from 'typegpu';
import { colors } from './geometry.ts';
import { root } from './root.ts';
import { createInstanceInfoArray, InstanceInfoArray } from './instanceInfo.ts';
import {
  gridParams,
  INITIAL_MIDDLE_SQUARE_SCALE,
  INITIAL_STEP_ROTATION,
} from './params.ts';

const animationProgressUniform = root.createUniform(d.f32);

const shiftedColorsBuffer = root.createReadonly(d.arrayOf(d.vec4f, 3), [
  ...colors,
]);

const TriangleVertices = d.struct({
  positions: d.arrayOf(d.vec2f, 9),
});

const instanceInfoLayout = tgpu.bindGroupLayout({
  instanceInfo: { storage: InstanceInfoArray },
});

let instanceInfoBindGroup = createInstanceInfoBufferAndBindGroup();

function getInstanceInfoBindGroup() {
  return instanceInfoBindGroup;
}

function createInstanceInfoBufferAndBindGroup() {
  const instanceInfoBuffer = root.createReadonly(
    InstanceInfoArray(gridParams.triangleCount),
    createInstanceInfoArray(),
  );

  const instanceInfoBindGroup = root.createBindGroup(instanceInfoLayout, {
    instanceInfo: instanceInfoBuffer.buffer,
  });

  return instanceInfoBindGroup;
}

function updateInstanceInfoBufferAndBindGroup() {
  instanceInfoBindGroup = createInstanceInfoBufferAndBindGroup();
}

const scaleBuffer = root.createUniform(d.f32, gridParams.tileDensity);
const aspectRatioBuffer = root.createUniform(d.f32, 1);

const stepRotationBuffer = root.createUniform(d.f32, INITIAL_STEP_ROTATION);

const middleSquareScaleBuffer = root.createUniform(
  d.f32,
  INITIAL_MIDDLE_SQUARE_SCALE,
);

const drawOverNeighborsBuffer = root.createUniform(d.u32, 0);

export {
  animationProgressUniform,
  aspectRatioBuffer,
  drawOverNeighborsBuffer,
  getInstanceInfoBindGroup,
  instanceInfoLayout,
  middleSquareScaleBuffer,
  scaleBuffer,
  shiftedColorsBuffer,
  stepRotationBuffer,
  updateInstanceInfoBufferAndBindGroup,
};
