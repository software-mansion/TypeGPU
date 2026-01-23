import tgpu, { d } from 'typegpu';

export const DirectionalLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
});

export const ObjectType = {
  SLIDER: 1,
  BACKGROUND: 2,
} as const;

export const HitInfo = d.struct({
  distance: d.f32,
  objectType: d.i32,
});

export const BoxIntersection = d.struct({
  hit: d.bool,
  tMin: d.f32,
  tMax: d.f32,
});

export const Ray = d.struct({
  origin: d.vec3f,
  direction: d.vec3f,
});

export type BoundingBox = d.Infer<typeof BoundingBox>;
export const BoundingBox = d.struct({
  min: d.vec3f,
  max: d.vec3f,
});

export const SwitchState = d.struct({
  progress: d.f32,
  squashX: d.f32,
  squashZ: d.f32,
  wiggleX: d.f32,
});

export const rayMarchLayout = tgpu.bindGroupLayout({
  backgroundTexture: { texture: d.texture2d(d.f32) },
});

export const taaResolveLayout = tgpu.bindGroupLayout({
  currentTexture: {
    texture: d.texture2d(),
  },
  historyTexture: {
    texture: d.texture2d(),
  },
  outputTexture: {
    storageTexture: d.textureStorage2d('rgba8unorm', 'write-only'),
  },
});

export const sampleLayout = tgpu.bindGroupLayout({
  currentTexture: {
    texture: d.texture2d(),
  },
});
