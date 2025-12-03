import tgpu, { type TgpuUniform } from 'typegpu';
import * as d from 'typegpu/data';
import type { KnobBehavior } from './knob.ts';
import type { Camera } from './camera.ts';

export const DirectionalLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
});

export const ObjectType = {
  JELLY: 1,
  PROGRESS_METER: 2,
  BACKGROUND: 3,
  SHADOW: 4,
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

export const RayMarchResult = d.struct({
  point: d.vec3f,
  color: d.vec3f,
});

export type BoundingBox = d.Infer<typeof BoundingBox>;
export const BoundingBox = d.struct({
  min: d.vec3f,
  max: d.vec3f,
});

export const KnobState = d.struct({
  topProgress: d.f32,
  bottomProgress: d.f32,
  time: d.f32,
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

export const knobBehaviorSlot = tgpu.slot<KnobBehavior>();
export const cameraUniformSlot = tgpu.slot<TgpuUniform<typeof Camera>>();
export const lightUniformSlot = tgpu.slot<
  TgpuUniform<typeof DirectionalLight>
>();
export const jellyColorUniformSlot = tgpu.slot<TgpuUniform<typeof d.vec4f>>();
export const darkModeUniformSlot = tgpu.slot<TgpuUniform<typeof d.u32>>();
export const randomUniformSlot = tgpu.slot<TgpuUniform<typeof d.vec2f>>();
// shader uses this as time, but it advances faster the more the knob is turned
export const effectTimeUniformSlot = tgpu.slot<TgpuUniform<typeof d.f32>>();
