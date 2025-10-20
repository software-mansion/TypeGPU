import tgpu, {
  type TgpuMutable,
  type TgpuSampler,
  type TgpuTexture,
  type TgpuUniform,
} from 'typegpu';
import * as d from 'typegpu/data';

export const externalTextureLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
});

export const textureLayout = tgpu.bindGroupLayout({
  inputTexture: { texture: d.texture2d() },
  maskTexture: { texture: d.texture2d() },
});

export const samplerSlot = tgpu.slot<TgpuSampler>();
export const maskSlot = tgpu.slot<TgpuMutable<d.WgslArray<d.F32>>>();
