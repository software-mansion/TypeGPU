import tgpu, { type TgpuSampler } from 'typegpu';
import * as d from 'typegpu/data';
import { Camera } from './setup-orbit-camera.ts';

export const CelestialBody = d.struct({
  destroyed: d.u32, // boolean
  position: d.vec3f,
  velocity: d.vec3f,
  mass: d.f32,
  radiusMultiplier: d.f32, // radius is calculated from the mass, and then multiplied by this
  collisionBehavior: d.u32, // value of the collisionBehaviors enum
  textureIndex: d.u32, // index of the global 2d-array texture for celestial bodies
  ambientLightFactor: d.f32,
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
  ambientLightFactor: d.f32,
};

export const SkyBoxVertex = d.struct({
  position: d.vec3f,
  uv: d.vec2f,
});

export const Time = d.struct({ passed: d.f32, multiplier: d.f32 });

// layouts
export const computeLayout = tgpu.bindGroupLayout({
  celestialBodiesCount: {
    uniform: d.i32,
  },
  inState: {
    storage: d.arrayOf(CelestialBody),
    access: 'readonly',
  },
  outState: {
    storage: d.arrayOf(CelestialBody),
    access: 'mutable',
  },
});

export const renderSkyBoxVertexLayout = tgpu.vertexLayout(
  d.arrayOf(SkyBoxVertex),
);

export const cameraAccess = tgpu['~unstable'].accessor(Camera);
export const filteringSamplerSlot = tgpu.slot<TgpuSampler>();
export const lightSourceAccess = tgpu['~unstable'].accessor(d.vec3f);
export const timeAccess = tgpu['~unstable'].accessor(Time);
export const skyBoxAccess = tgpu['~unstable'].accessor(d.textureCube(d.f32));

export const renderBindGroupLayout = tgpu
  .bindGroupLayout({
    celestialBodyTextures: { texture: d.texture2dArray(d.f32) },
    celestialBodies: {
      storage: d.arrayOf(CelestialBody),
      access: 'readonly',
    },
  });

export const renderVertexLayout = tgpu
  .vertexLayout(d.arrayOf(d.struct(VertexInput)));
