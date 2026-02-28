import tgpu, { d } from 'typegpu';

// schemas

export type Line3 = d.Infer<typeof Line3>;
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

export const Camera = d.struct({
  position: d.vec4f,
  targetPos: d.vec4f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

export const ModelData = d.struct({
  position: d.vec3f,
  direction: d.vec3f, // in case of the fish, this is also the velocity
  scale: d.f32,
  variant: d.f32, // (0-1)
  applySinWave: d.u32, // bool
  applySeaFog: d.u32, // bool
  applySeaDesaturation: d.u32, // bool
});

export const ModelDataArray = d.arrayOf(ModelData);

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

export const FishBehaviorParams = d.struct({
  separationDist: d.f32,
  separationStr: d.f32,
  alignmentDist: d.f32,
  alignmentStr: d.f32,
  cohesionDist: d.f32,
  cohesionStr: d.f32,
});

// layouts

export const modelVertexLayout = tgpu.vertexLayout((n: number) =>
  d.arrayOf(d.struct(ModelVertexInput), n),
);

export const renderInstanceLayout = tgpu.vertexLayout(ModelDataArray, 'instance');

export const renderBindGroupLayout = tgpu.bindGroupLayout({
  modelData: { storage: ModelDataArray },
  modelTexture: { texture: d.texture2d(d.f32) },
  camera: { uniform: Camera },
  sampler: { sampler: 'filtering' },
  currentTime: { uniform: d.f32 },
});

export const computeBindGroupLayout = tgpu.bindGroupLayout({
  currentFishData: { storage: ModelDataArray },
  nextFishData: {
    storage: ModelDataArray,
    access: 'mutable',
  },
  mouseRay: { uniform: Line3 },
  timePassed: { uniform: d.f32 },
  fishBehavior: { uniform: FishBehaviorParams },
});
