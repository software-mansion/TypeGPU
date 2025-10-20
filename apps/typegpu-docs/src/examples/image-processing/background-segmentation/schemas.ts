import tgpu, {
  type TgpuBuffer,
  type TgpuMutable,
  type TgpuSampler,
} from 'typegpu';
import * as d from 'typegpu/data';

export const prepareModelInputLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
  outputBuffer: { storage: d.arrayOf(d.f32), access: 'mutable' },
  sampler: { sampler: 'filtering' },
});

export const drawWithMaskLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
  maskTexture: { texture: d.texture2d() },
});

export const samplerSlot = tgpu.slot<TgpuSampler>();
export const maskSlot = tgpu.slot<TgpuMutable<d.WgslArray<d.F32>>>();
