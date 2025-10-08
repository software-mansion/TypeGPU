import tgpu, { type TgpuSampler, type TgpuUniform } from 'typegpu';
import * as d from 'typegpu/data';

export const textureLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
});

export const samplerSlot = tgpu.slot<TgpuSampler>();
export const uvTransformUniformSlot = tgpu.slot<TgpuUniform<d.Mat2x2f>>();
