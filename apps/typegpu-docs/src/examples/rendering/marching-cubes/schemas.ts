import tgpu from 'typegpu';
import * as d from 'typegpu/data';

// schemas

export const Camera = d.struct({
  position: d.vec4f,
  targetPos: d.vec4f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

export const ModelVertexInput = d.struct({
  modelPosition: d.vec3f,
  modelNormal: d.vec3f,
});

export const ModelVertexOutput = {
  worldPosition: d.vec3f,
  worldNormal: d.vec3f,
  canvasPosition: d.builtin.position,
} as const;

// layouts

export const modelVertexLayout = tgpu.vertexLayout((n: number) =>
  d.arrayOf(ModelVertexInput, n)
);

export const renderBindGroupLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
});
