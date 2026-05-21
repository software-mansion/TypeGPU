import { d } from 'typegpu';
import type { SampledFlag, StorageFlag, TgpuBuffer, TgpuTexture, TgpuTextureView } from 'typegpu';

export const maskPostProcessProfiles = ['raw', 'temporal', 'balanced'] as const;
export type MaskPostProcessProfile = (typeof maskPostProcessProfiles)[number];

export interface MaskOutputSize {
  width: number;
  height: number;
}

export type MaskTexture = TgpuTexture<{
  size: readonly [number, number];
  format: 'rgba16float';
}> &
  StorageFlag &
  SampledFlag;

export type MaskBuffer = TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
export type SampledMaskView = TgpuTextureView<d.WgslTexture2d<d.F32>>;
export type StorageMaskView = TgpuTextureView<d.WgslStorageTexture2d<'rgba16float', 'write-only'>>;

export interface MaskTarget {
  texture: MaskTexture;
  sampleView: SampledMaskView;
  storageView: StorageMaskView;
  workgroupsX: number;
  workgroupsY: number;
}
