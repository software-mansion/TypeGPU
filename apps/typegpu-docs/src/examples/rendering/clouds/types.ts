import { tgpu, d } from 'typegpu';

export const CloudsParams = d.struct({
  time: d.f32,
  maxSteps: d.i32,
  maxDistance: d.f32,
});

export const precomputeDensityLayout = tgpu.bindGroupLayout({
  params: { uniform: CloudsParams },
  noiseTexture: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
  densityTexture: {
    storageTexture: d.textureStorage3d('rgba8unorm', 'write-only'),
  },
});

export const cloudsLayout = tgpu.bindGroupLayout({
  params: { uniform: CloudsParams },
  densityTexture: { texture: d.texture3d() },
  sampler: { sampler: 'filtering' },
});

export const upscaleLayout = tgpu.bindGroupLayout({
  cloudTexture: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});
