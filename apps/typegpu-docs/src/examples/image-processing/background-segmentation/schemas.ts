import tgpu, { type TgpuUniform } from 'typegpu';
import * as d from 'typegpu/data';

// constants

export const iterations = 10;
export const filterDim = 25;
export const blockDim = 128 - filterDim + 1;

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
});

export const drawWithMaskLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
  inputBlurredTexture: { texture: d.texture2d() },
  maskTexture: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});

// slots

export const useGaussianSlot = tgpu.slot<TgpuUniform<d.U32>>();
export const sampleBiasSlot = tgpu.slot<TgpuUniform<d.F32>>();
