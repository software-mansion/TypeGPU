import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const VertexStruct = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
  uv: d.vec2f,
});

export const CameraStruct = d.struct({
  position: d.vec3f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

// Cube
export const ObjectStruct = d.struct({
  modelMatrix: d.mat4x4f,
});

export const centerObjectBindGroupLayout = tgpu.bindGroupLayout({
  object: { uniform: ObjectStruct },
});

export const cameraBindGroupLayout = tgpu.bindGroupLayout({
  camera: { uniform: CameraStruct },
  // texture: { texture: 'float' },
  sampler: { sampler: 'filtering' },
});

// Celestial Bodies
export const CelestialBodyStruct = d.struct({
  modelMatrix: d.mat4x4f,
  position: d.vec3f,
  velocity: d.vec3f,
  mass: d.f32,
});
export const CelestialBodyArray = (n: number) =>
  d.arrayOf(CelestialBodyStruct, n);

export const celestialBodyLayout = tgpu.bindGroupLayout({
  inState: { storage: CelestialBodyArray, access: 'readonly' },
  outState: { storage: CelestialBodyArray, access: 'mutable' },
});
