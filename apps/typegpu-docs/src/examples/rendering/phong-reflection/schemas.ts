import tgpu from 'typegpu';
import * as d from 'typegpu/data';

// schemas

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
