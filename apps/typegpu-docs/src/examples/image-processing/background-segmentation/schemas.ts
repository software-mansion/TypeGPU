import tgpu from 'typegpu';
import * as d from 'typegpu/data';

// constants

// AAA usuń to
export const settings = {
  filterDim: 25,
  iterations: 1,
  get blockDim() {
    return 128 - (this.filterDim) + 1;
  },
};

// schemas

export const Settings = d.struct({
  filterDim: d.i32,
  blockDim: d.u32,
});

// layouts

export const prepareModelInputLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
  outputBuffer: { storage: d.arrayOf(d.f32), access: 'mutable' },
  sampler: { sampler: 'filtering' },
});

export const generateMaskLayout = tgpu.bindGroupLayout({
  outputBuffer: { storage: d.arrayOf(d.f32), access: 'readonly' },
  maskTexture: {
    storageTexture: d.textureStorage2d('rgba8unorm', 'write-only'),
  },
});

export const blurLayout = tgpu.bindGroupLayout({
  flip: { uniform: d.u32 },
  inTexture: { texture: d.texture2d(d.f32) },
  outTexture: { storageTexture: d.textureStorage2d('rgba8unorm') },
  sampler: { sampler: 'filtering' },
  settings: { uniform: Settings },
});

export const drawWithMaskLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
  inputBlurredTexture: { texture: d.texture2d() },
  maskTexture: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});
