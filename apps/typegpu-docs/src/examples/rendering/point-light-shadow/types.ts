import tgpu, { d } from 'typegpu';

export const CameraData = d.struct({
  viewProjectionMatrix: d.mat4x4f,
  inverseViewProjectionMatrix: d.mat4x4f,
});
export type CameraData = typeof CameraData;

export const VertexData = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
  uv: d.vec2f,
});
export type VertexData = typeof VertexData;

export const InstanceData = d.struct({
  column1: d.vec4f,
  column2: d.vec4f,
  column3: d.vec4f,
  column4: d.vec4f,
});
export type InstanceData = typeof InstanceData;

export const vertexLayout = tgpu.vertexLayout(d.arrayOf(VertexData));
export const instanceLayout = tgpu.vertexLayout(d.arrayOf(InstanceData), 'instance');

export type GeometryData = d.Infer<typeof VertexData>[];
