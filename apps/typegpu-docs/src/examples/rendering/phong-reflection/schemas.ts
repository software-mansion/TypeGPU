import tgpu, { d } from 'typegpu';

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

export const ExampleControls = d.struct({
  lightColor: d.vec3f,
  lightDirection: d.vec3f,
  ambientColor: d.vec3f,
  ambientStrength: d.f32,
  specularExponent: d.f32,
});

// layouts

export const modelVertexLayout = tgpu.vertexLayout(d.arrayOf(ModelVertexInput));
