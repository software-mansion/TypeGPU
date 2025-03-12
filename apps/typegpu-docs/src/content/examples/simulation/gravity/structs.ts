import * as d from 'typegpu/data';
import tgpu from 'typegpu';

export const VertexStruct = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
  uv: d.vec2f,
});
export const CameraStruct = d.struct({
  position: d.vec3f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

export const ObjectStruct = d.struct({
  modelMatrix: d.mat4x4f,
});

export const bindObjectLayout = tgpu.bindGroupLayout({
  object: { uniform: ObjectStruct },
});

export const bindGroupLayout = tgpu.bindGroupLayout({
  camera: { uniform: CameraStruct },
  // texture: { texture: 'float' },
  sampler: { sampler: 'filtering' },
});
