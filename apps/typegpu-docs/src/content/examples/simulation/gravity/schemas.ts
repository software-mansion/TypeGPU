import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const Camera = d.struct({
  position: d.vec3f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

export const VertexInput = {
  position: d.vec3f,
  normal: d.vec3f,
  uv: d.vec2f,
};

export const VertexOutput = {
  position: d.builtin.position,
  uv: d.vec2f,
  normals: d.vec3f,
  worldPosition: d.vec3f,
};

export const CelestialBody = d.struct({
  modelTransformationMatrix: d.mat4x4f,
  position: d.vec3f,
  velocity: d.vec3f,
  mass: d.f32,
});

// layouts
export const computeBindGroupLayout = tgpu.bindGroupLayout({
  inState: {
    storage: (n: number) => d.arrayOf(CelestialBody, n),
    access: 'readonly',
  },
  outState: {
    storage: (n: number) => d.arrayOf(CelestialBody, n),
    access: 'mutable',
  },
});

export const renderBindGroupLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  sampler: { sampler: 'filtering' },
});

export const renderInstanceLayout = tgpu.vertexLayout((n: number) =>
  d.arrayOf(d.struct(VertexInput), n),
);
