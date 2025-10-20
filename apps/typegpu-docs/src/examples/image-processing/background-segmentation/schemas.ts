import tgpu, { type TgpuMutable, type TgpuSampler } from 'typegpu';
import * as d from 'typegpu/data';

export const downscaleLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
  outputBuffer: { storage: d.arrayOf(d.f32), access: 'mutable' },
  sampler: { sampler: 'filtering' },
});

export const externalTextureLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
});

export const textureLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
  maskTexture: { texture: d.texture2d() },
});

export const samplerSlot = tgpu.slot<TgpuSampler>();
export const maskSlot = tgpu.slot<TgpuMutable<d.WgslArray<d.F32>>>();
