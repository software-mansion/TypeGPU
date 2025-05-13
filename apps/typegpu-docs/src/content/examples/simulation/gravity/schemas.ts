import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const Camera = d.struct({
  position: d.vec3f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

export const CelestialBody = d
  .struct({
    destroyed: d.u32, // boolean
    position: d.vec3f,
    velocity: d.vec3f,
    mass: d.f32,
    radiusMultiplier: d.f32, // radius is calculated from the mass, and then multiplied by this
    collisionBehavior: d.u32, // value of the collisionBehaviors enum
    textureIndex: d.u32, // index of the global 2d-array texture for celestial bodies
    ambientLightFactor: d.f32,
  })
  .$name('CelestialBody');

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
  ambientLightFactor: d.f32,
};

export const SkyBoxVertex = d
  .struct({
    position: d.vec3f,
    uv: d.vec2f,
  })
  .$name('SkyBoxVertex');

export const Time = d
  .struct({ passed: d.f32, multiplier: d.f32 })
  .$name('Time');

// layouts
export const computeCollisionsBindGroupLayout = tgpu
  .bindGroupLayout({
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
  })
  .$name('compute collisions');

export const computeGravityBindGroupLayout = tgpu
  .bindGroupLayout({
    celestialBodiesCount: {
      uniform: d.i32,
      access: 'readonly',
    },
    time: {
      uniform: Time,
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
  })
  .$name('compute gravity');

export const renderSkyBoxBindGroupLayout = tgpu
  .bindGroupLayout({
    camera: { uniform: Camera },
    skyBox: { texture: 'float', viewDimension: 'cube' },
    sampler: { sampler: 'filtering' },
  })
  .$name('render skybox');

export const renderSkyBoxVertexLayout = tgpu
  .vertexLayout((n: number) => d.arrayOf(SkyBoxVertex, n))
  .$name('render skybox');

export const renderBindGroupLayout = tgpu
  .bindGroupLayout({
    camera: { uniform: Camera },
    sampler: { sampler: 'filtering' },
    lightSource: { uniform: d.vec3f },
    celestialBodyTextures: { texture: 'float', viewDimension: '2d-array' },
    celestialBodies: {
      storage: (n: number) => d.arrayOf(CelestialBody, n),
      access: 'readonly',
    },
  })
  .$name('render');

export const renderVertexLayout = tgpu
  .vertexLayout((n: number) => d.arrayOf(d.struct(VertexInput), n))
  .$name('render');
