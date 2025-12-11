import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const cloudsLayout = tgpu.bindGroupLayout({
  time: { uniform: d.f32 },
  noiseTexture: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});
