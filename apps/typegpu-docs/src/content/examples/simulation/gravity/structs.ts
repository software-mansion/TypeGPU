import * as d from 'typegpu/data';
import tgpu from 'typegpu';

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

export const bindObjectLayout = tgpu.bindGroupLayout({
  object: { uniform: ObjectStruct },
});

export const bindGroupLayout = tgpu.bindGroupLayout({
  camera: { uniform: CameraStruct },
  // texture: { texture: 'float' },
  sampler: { sampler: 'filtering' },
});

// Celestial Bodies
export const CelectialBodyStruct = d.struct({
  position: d.vec3f,
  velocity: d.vec3f,
  mass: d.f32,
});
export const CelestialBodyArray = (n: number) =>
  d.arrayOf(CelectialBodyStruct, n);

export const celestialBodyBindGroup = tgpu.bindGroupLayout({
  inState: { uniform: CelestialBodyArray(1), access: 'readonly' },
  outState: { uniform: CelestialBodyArray(1), access: 'writeonly' },
});
