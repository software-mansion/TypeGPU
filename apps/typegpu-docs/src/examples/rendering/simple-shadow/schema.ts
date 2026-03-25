import tgpu, { d } from 'typegpu';

// Data structures
export const Material = d.struct({
  ambient: d.vec3f,
  diffuse: d.vec3f,
  specular: d.vec3f,
  shininess: d.f32,
});

export const VertexInfo = d.struct({
  position: d.vec4f,
  normal: d.vec4f,
});

export const InstanceInfo = d.struct({
  modelMatrix: d.mat4x4f,
  material: Material,
});

export const Camera = d.struct({
  projection: d.mat4x4f,
  view: d.mat4x4f,
  position: d.vec3f,
});

export const DirectionalLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
});

export const VisParams = d.struct({
  shadowOnly: d.f32,
  lightDepth: d.f32,
});

export const LightSpace = d.struct({
  viewProj: d.mat4x4f,
});

// Bind group layouts
export const bindGroupLayout = tgpu.bindGroupLayout({
  instanceInfo: { uniform: InstanceInfo },
});

export const shadowSampleLayout = tgpu.bindGroupLayout({
  shadowMap: { texture: d.textureDepth2d() },
  comparisonSampler: { sampler: 'comparison' },
});
