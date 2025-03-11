import * as d from 'typegpu/data';
import tgpu from 'typegpu';

// schemas

export const Camera = d.struct({
  position: d.vec4f,
  c_target: d.vec4f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

export const ModelData = d.struct({
  position: d.vec3f,
  direction: d.vec3f, // in case of the fish, this is also the velocity
  scale: d.f32,
  seaFog: d.u32, // bool
  seaBlindness: d.u32, // bool
});

export const ModelDataArray = (n: number) => d.arrayOf(ModelData, n);

export const ModelVertexInput = {
  modelPosition: d.vec3f,
  modelNormal: d.vec3f,
  textureUV: d.vec2f,
  instanceIndex: d.builtin.instanceIndex,
} as const;

export const ModelVertexOutput = {
  worldPosition: d.vec3f,
  worldNormal: d.vec3f,
  canvasPosition: d.builtin.position,
  textureUV: d.vec2f,
  seaFog: d.interpolate('flat', d.u32), // bool
  seaBlindness: d.interpolate('flat', d.u32), // bool
} as const;

export const MouseRay = d.struct({
  activated: d.u32,
  pointX: d.vec3f,
  pointY: d.vec3f,
});

// layouts

export const modelVertexLayout = tgpu.vertexLayout((n: number) =>
  d.arrayOf(d.struct(ModelVertexInput), n),
);

export const renderInstanceLayout = tgpu.vertexLayout(
  ModelDataArray,
  'instance',
);

export const renderBindGroupLayout = tgpu.bindGroupLayout({
  modelData: { storage: ModelDataArray },
  modelTexture: { texture: 'float' },
  camera: { uniform: Camera },
  sampler: { sampler: 'filtering' },
});

export const computeBindGroupLayout = tgpu.bindGroupLayout({
  currentFishData: { storage: ModelDataArray },
  nextFishData: {
    storage: ModelDataArray,
    access: 'mutable',
  },
  mouseRay: { uniform: MouseRay },
  timePassed: { uniform: d.u32 },
});
