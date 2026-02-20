import tgpu, { d } from 'typegpu';

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

export const Params = d.struct({
  cropBounds: d.vec4f,
  useGaussian: d.u32,
  sampleBias: d.f32,
});

export const paramsAccess = tgpu.accessor(Params);
export const flipAccess = tgpu.accessor(d.bool);

export interface ModelConfig {
  name: string;
  path: string;
  inputName: string;
  outputName: string;
  externalData?: { data: string; path: string }[];
  description?: string;
}
