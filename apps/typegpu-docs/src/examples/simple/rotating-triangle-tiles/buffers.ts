import * as d from 'typegpu/data';
import tgpu from 'typegpu';
import { colors } from './geometry.ts';
import { root } from './root.ts';
import { triangleVertices } from './geometry.ts';
import { createInstanceInfoArray, InstanceInfoArray } from './instanceInfo.ts';
import { GridParams, gridParams } from './config.ts';

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

const instanceInfoLayout = tgpu.bindGroupLayout({
  instanceInfo: { storage: InstanceInfoArray },
});

let { instanceInfoBuffer, instanceInfoBindGroup } =
  createInstanceInfoBufferAndBindGroup();

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

  return { instanceInfoBuffer, instanceInfoBindGroup };
}


function updateInstanceInfoBufferAndBindGroup() {
  ({ instanceInfoBuffer, instanceInfoBindGroup } =
    createInstanceInfoBufferAndBindGroup())
}

const gridParamsBuffer = root.createUniform(GridParams, gridParams);
const aspectRatioBuffer = root.createUniform(d.f32, 1)

export {
  animationProgressUniform,
  aspectRatioBuffer,
  getInstanceInfoBindGroup,
  gridParamsBuffer,
  instanceInfoLayout,
  shiftedColorsBuffer,
  triangleVerticesBuffer,
  updateInstanceInfoBufferAndBindGroup
};
