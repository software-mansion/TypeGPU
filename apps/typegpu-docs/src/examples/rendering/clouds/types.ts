import tgpu, { d } from 'typegpu';

export const CloudsParams = d.struct({
  time: d.f32,
  maxSteps: d.i32,
  maxDistance: d.f32,
});

export const cloudsLayout = tgpu.bindGroupLayout({
  params: { uniform: CloudsParams },
  noiseTexture: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});
