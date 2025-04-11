import tgpu from 'typegpu';
import * as d from 'typegpu/data';

// schemas

export const Camera = d
  .struct({
    position: d.vec4f,
    targetPos: d.vec4f,
    view: d.mat4x4f,
    projection: d.mat4x4f,
  })
  .$name('camera');

export const ModelData = d
  .struct({
    position: d.vec3f,
    direction: d.vec3f, // in case of the fish, this is also the velocity
    scale: d.f32,
    applySeaFog: d.u32, // bool
    applySeaDesaturation: d.u32, // bool
  })
  .$name('model data');

export const ModelDataArray = (n: number) => d.arrayOf(ModelData, n);

export const ModelVertexInput = {
  modelPosition: d.vec3f,
  modelNormal: d.vec3f,
  textureUV: d.vec2f,
} as const;

export const ModelVertexOutput = {
  worldPosition: d.vec3f,
  worldNormal: d.vec3f,
  canvasPosition: d.builtin.position,
  textureUV: d.vec2f,
  applySeaFog: d.interpolate('flat', d.u32), // bool
  applySeaDesaturation: d.interpolate('flat', d.u32), // bool
} as const;

export const MouseRay = d
  .struct({
    activated: d.u32,
    pointX: d.vec3f,
    pointY: d.vec3f,
  })
  .$name('mouse ray');

// layouts

export const modelVertexLayout = tgpu
  .vertexLayout((n: number) => d.arrayOf(d.struct(ModelVertexInput), n))
  .$name('model vertex layout');

export const renderInstanceLayout = tgpu
  .vertexLayout(ModelDataArray, 'instance')
  .$name('render instance layout');

export const renderBindGroupLayout = tgpu
  .bindGroupLayout({
    modelData: { storage: ModelDataArray },
    modelTexture: { texture: 'float' },
    camera: { uniform: Camera },
    sampler: { sampler: 'filtering' },
  })
  .$name('render bind group layout');

export const computeBindGroupLayout = tgpu
  .bindGroupLayout({
    currentFishData: { storage: ModelDataArray },
    nextFishData: {
      storage: ModelDataArray,
      access: 'mutable',
    },
    mouseRay: { uniform: MouseRay },
    timePassed: { uniform: d.u32 },
  })
  .$name('compute bind group layout');
