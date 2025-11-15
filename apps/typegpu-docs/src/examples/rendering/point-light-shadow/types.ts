import * as d from 'typegpu/data';

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

export type GeometryData = d.Infer<typeof VertexData>[];
