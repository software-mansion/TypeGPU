import tgpu from 'typegpu';
import * as d from 'typegpu/data';

// schemas

export const Line3 = d.struct({
  /**
   * A point on the line
   */
  origin: d.vec3f,
  /**
   * Normalized direction along the line
   */
  dir: d.vec3f,
});

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
    variant: d.f32, // (0-1)
    applySinWave: d.u32, // bool
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
  variant: d.f32,
  textureUV: d.vec2f,
  applySeaFog: d.interpolate('flat', d.u32), // bool
  applySeaDesaturation: d.interpolate('flat', d.u32), // bool
} as const;

export const MouseRay = d
  .struct({
    activated: d.u32,
    line: Line3,
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
    currentTime: { uniform: d.f32 },
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
    timePassed: { uniform: d.f32 },
  })
  .$name('compute bind group layout');
