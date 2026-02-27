import * as d from 'typegpu/data';
import tgpu, { type TgpuRoot } from 'typegpu';
import { colors } from './geometry.ts';
import { createInstanceInfoArray, InstanceInfoArray } from './instanceInfo.ts';
import {
  getGridParams,
  INITIAL_MIDDLE_SQUARE_SCALE,
  INITIAL_STEP_ROTATION,
} from './params.ts';

const stepRotationAccess = tgpu.accessor(d.f32);
const shiftedColorsAccess = tgpu.accessor(d.arrayOf(d.vec4f, 3));
const animationProgressAccess = tgpu.accessor(d.f32);
const middleSquareScaleAccess = tgpu.accessor(d.f32);
const drawOverNeighborsAccess = tgpu.accessor(d.u32);
const scaleAccess = tgpu.accessor(d.f32);
const aspectRatioAccess = tgpu.accessor(d.f32);

const instanceInfoLayout = tgpu.bindGroupLayout({
  instanceInfo: { storage: InstanceInfoArray },
});

function createBuffers(root: TgpuRoot) {
  const animationProgressUniform = root.createUniform(d.f32);

  const shiftedColorsUniform = root.createUniform(
    d.arrayOf(d.vec4f, 3),
    colors,
  );

  let instanceInfoBindGroup = createInstanceInfoBufferAndBindGroup();

  function getInstanceInfoBindGroup() {
    return instanceInfoBindGroup;
  }

  function createInstanceInfoBufferAndBindGroup() {
    const instanceInfoReadonly = root.createReadonly(
      InstanceInfoArray(getGridParams().triangleCount),
      createInstanceInfoArray(),
    );

    const instanceInfoBindGroup = root.createBindGroup(instanceInfoLayout, {
      instanceInfo: instanceInfoReadonly.buffer,
    });

    return instanceInfoBindGroup;
  }

  function updateInstanceInfoBufferAndBindGroup() {
    instanceInfoBindGroup = createInstanceInfoBufferAndBindGroup();
  }

  const scaleUniform = root.createUniform(d.f32, getGridParams().tileDensity);
  const aspectRatioUniform = root.createUniform(d.f32, 1);

  const stepRotationUniform = root.createUniform(d.f32, INITIAL_STEP_ROTATION);

  const middleSquareScaleUniform = root.createUniform(
    d.f32,
    INITIAL_MIDDLE_SQUARE_SCALE,
  );

  const drawOverNeighborsUniform = root.createUniform(d.u32, 0);

  return {
    animationProgressUniform,
    aspectRatioUniform,
    drawOverNeighborsUniform,
    getInstanceInfoBindGroup,
    middleSquareScaleUniform,
    scaleUniform,
    shiftedColorsUniform,
    stepRotationUniform,
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
