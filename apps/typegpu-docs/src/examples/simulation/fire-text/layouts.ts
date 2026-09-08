import { tgpu, d } from 'typegpu';
import { Particle } from './params.ts';

export const smokeLayout = tgpu.bindGroupLayout({
  linearSampler: { sampler: 'filtering' },
  inTex: { texture: d.texture2d(d.f32) },
  outTex: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
  textTex: { texture: d.texture2d(d.f32), sampleType: 'unfilterable-float' },
});

export const sourceLayout = tgpu.bindGroupLayout({
  tex: { texture: d.texture2d(d.f32), sampleType: 'unfilterable-float' },
});

export const pressureLayout = tgpu.bindGroupLayout({
  inTex: { storageTexture: d.textureStorage2d('r32float', 'read-only') },
  outTex: { storageTexture: d.textureStorage2d('r32float', 'write-only') },
  divTex: { texture: d.texture2d(d.f32), sampleType: 'unfilterable-float' },
});

export const divergenceLayout = tgpu.bindGroupLayout({
  divTex: { storageTexture: d.textureStorage2d('r32float', 'write-only') },
  textTex: { texture: d.texture2d(d.f32), sampleType: 'unfilterable-float' },
  pressureTex: { storageTexture: d.textureStorage2d('r32float', 'write-only') },
});

export const constantSourceLayout = tgpu.bindGroupLayout({
  tex: { storageTexture: d.textureStorage2d('r32float', 'read-write') },
});

export const particleComputeLayout = tgpu.bindGroupLayout({
  particles: { storage: d.arrayOf(Particle), access: 'mutable' },
});

export const particleRenderLayout = tgpu.bindGroupLayout({
  particles: { storage: d.arrayOf(Particle), access: 'readonly' },
  textTex: { texture: d.texture2d(d.f32), sampleType: 'unfilterable-float' },
});

export const displayLayout = tgpu.bindGroupLayout({
  linearSampler: { sampler: 'filtering' },
  displayTex: { texture: d.texture2d(d.f32) },
});
