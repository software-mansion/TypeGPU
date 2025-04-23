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
  sphereTextureIndex: d.interpolate('flat', d.u32),
  destroyed: d.interpolate('flat', d.u32),
};

export const CelestialBody = d.struct({
  destroyed: d.u32, // boolean
  position: d.vec3f,
  velocity: d.vec3f,
  mass: d.f32,
  collisionBehavior: d.u32, // index of the collisionBehavior enum
  textureIndex: d.u32, // index of the global 2d-array texture for celestial bodies
});

export const SkyBoxVertex = d.struct({
  position: d.vec4f,
  uv: d.vec2f,
});

// layouts
export const computeCollisionsBindGroupLayout = tgpu.bindGroupLayout({
  celestialBodiesCount: {
    uniform: d.i32,
    access: 'readonly',
  },
  inState: {
    storage: (n: number) => d.arrayOf(CelestialBody, n),
    access: 'readonly',
  },
  outState: {
    storage: (n: number) => d.arrayOf(CelestialBody, n),
    access: 'mutable',
  },
});

export const computeGravityBindGroupLayout = tgpu.bindGroupLayout({
  celestialBodiesCount: {
    uniform: d.i32,
    access: 'readonly',
  },
  timeMultiplier: {
    uniform: d.f32,
    access: 'readonly',
  },
  inState: {
    storage: (n: number) => d.arrayOf(CelestialBody, n),
    access: 'readonly',
  },
  outState: {
    storage: (n: number) => d.arrayOf(CelestialBody, n),
    access: 'mutable',
  },
});

export const skyBoxBindGroupLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  skyBox: { texture: 'float', viewDimension: 'cube' },
  sampler: { sampler: 'filtering' },
});

export const skyBoxVertexLayout = tgpu.vertexLayout((n: number) =>
  d.arrayOf(SkyBoxVertex, n),
);

export const renderBindGroupLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  sampler: { sampler: 'filtering' },
  celestialBodyTextures: { texture: 'float', viewDimension: '2d-array' },
  celestialBodies: {
    storage: (n: number) => d.arrayOf(CelestialBody, n),
    access: 'readonly',
  },
});

export const renderVertexLayout = tgpu.vertexLayout((n: number) =>
  d.arrayOf(d.struct(VertexInput), n),
);
