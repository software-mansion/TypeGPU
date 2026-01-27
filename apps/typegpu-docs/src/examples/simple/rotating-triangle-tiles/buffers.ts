import * as d from 'typegpu/data';
import tgpu, { type TgpuRoot } from 'typegpu';
import { colors } from './geometry.ts';
import { createInstanceInfoArray, InstanceInfoArray } from './instanceInfo.ts';
import {
  getGridParams,
  INITIAL_MIDDLE_SQUARE_SCALE,
  INITIAL_STEP_ROTATION,
} from './params.ts';

const stepRotationAccess = tgpu['~unstable'].accessor(d.f32);
const shiftedColorsAccess = tgpu['~unstable'].accessor(d.arrayOf(d.vec4f, 3));
const animationProgressAccess = tgpu['~unstable'].accessor(d.f32);
const middleSquareScaleAccess = tgpu['~unstable'].accessor(d.f32);
const drawOverNeighborsAccess = tgpu['~unstable'].accessor(d.u32);
const scaleAccess = tgpu['~unstable'].accessor(d.f32);
const aspectRatioAccess = tgpu['~unstable'].accessor(d.f32);

const instanceInfoLayout = tgpu.bindGroupLayout({
  instanceInfo: { storage: InstanceInfoArray },
});

function createBuffers(root: TgpuRoot) {
  const animationProgressUniform = root.createUniform(d.f32);

  const shiftedColorsBuffer = root.createReadonly(d.arrayOf(d.vec4f, 3), [
    ...colors,
  ]);

  let instanceInfoBindGroup = createInstanceInfoBufferAndBindGroup();

  function getInstanceInfoBindGroup() {
    return instanceInfoBindGroup;
  }

  function createInstanceInfoBufferAndBindGroup() {
    const instanceInfoBuffer = root.createReadonly(
      InstanceInfoArray(getGridParams().triangleCount),
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

  const scaleBuffer = root.createUniform(d.f32, getGridParams().tileDensity);
  const aspectRatioBuffer = root.createUniform(d.f32, 1);

  const stepRotationBuffer = root.createUniform(d.f32, INITIAL_STEP_ROTATION);

  const middleSquareScaleBuffer = root.createUniform(
    d.f32,
    INITIAL_MIDDLE_SQUARE_SCALE,
  );

  const drawOverNeighborsBuffer = root.createUniform(d.u32, 0);

  return {
    animationProgressUniform,
    aspectRatioBuffer,
    drawOverNeighborsBuffer,
    getInstanceInfoBindGroup,
    middleSquareScaleBuffer,
    scaleBuffer,
    shiftedColorsBuffer,
    stepRotationBuffer,
    updateInstanceInfoBufferAndBindGroup,
  };
}

export {
  animationProgressAccess,
  aspectRatioAccess,
  createBuffers,
  drawOverNeighborsAccess,
  instanceInfoLayout,
  middleSquareScaleAccess,
  scaleAccess,
  shiftedColorsAccess,
  stepRotationAccess,
};
