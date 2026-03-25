import tgpu, { d, type SampledFlag, type StorageFlag, type TgpuTexture } from 'typegpu';

export const VisualizationParams = d.struct({
  showInside: d.u32,
  showOutside: d.u32,
});

export const BrushParams = d.struct({
  center: d.vec2f,
  radius: d.f32,
  erasing: d.u32,
});

export const SampleResult = d.struct({
  inside: d.vec2f,
  outside: d.vec2f,
});

export const paramsAccess = tgpu.accessor(VisualizationParams);

export const distSampleLayout = tgpu.bindGroupLayout({
  distTexture: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});

export const initLayout = tgpu.bindGroupLayout({
  writeView: {
    storageTexture: d.textureStorage2d('rgba16float', 'write-only'),
  },
});

export const pingPongLayout = tgpu.bindGroupLayout({
  writeView: {
    storageTexture: d.textureStorage2d('rgba16float', 'write-only'),
  },
  readView: {
    storageTexture: d.textureStorage2d('rgba16float', 'read-only'),
  },
});

export const maskLayout = tgpu.bindGroupLayout({
  maskTexture: {
    storageTexture: d.textureStorage2d('r32uint', 'write-only'),
  },
});

export const distWriteLayout = tgpu.bindGroupLayout({
  distTexture: {
    storageTexture: d.textureStorage2d('rgba16float', 'write-only'),
  },
});

export const initFromMaskLayout = tgpu.bindGroupLayout({
  maskTexture: {
    storageTexture: d.textureStorage2d('r32uint', 'read-only'),
  },
  writeView: {
    storageTexture: d.textureStorage2d('rgba16float', 'write-only'),
  },
});

export type FloodTexture = TgpuTexture<{ size: [number, number]; format: 'rgba16float' }> &
  StorageFlag;

export type MaskTexture = TgpuTexture<{ size: [number, number]; format: 'r32uint' }> & StorageFlag;

export type DistanceTexture = TgpuTexture<{ size: [number, number]; format: 'rgba16float' }> &
  SampledFlag &
  StorageFlag;
