import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const ModelVertexInput = {
  modelPosition: d.vec3f,
  modelNormal: d.vec3f,
} as const;

export const ModelVertexOutput = {
  canvasPosition: d.builtin.position,
  worldNormal: d.vec3f,
} as const;

export const ModelFragmentInput = ModelVertexOutput;

export const Uniforms = d.struct({
  viewProjectionMatrix: d.mat4x4f,
  modelMatrix: d.mat4x4f,
});

export const modelVertexLayout = tgpu.vertexLayout((n: number) =>
  d.arrayOf(d.struct(ModelVertexInput), n)
);
