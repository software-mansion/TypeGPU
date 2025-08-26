import { $repr } from '../shared/symbols.ts';
import type { BaseData } from './wgslTypes.ts';

interface BaseTextureProps {
  readonly aspect: GPUTextureAspect;
  readonly baseMipLevel: number;
  readonly mipLevelCount: number;
  readonly baseArrayLayer: number;
  readonly arrayLayerCount: number;
  readonly format?: GPUTextureFormat;
}

export interface WgslSampledTexture<
  TSample extends GPUTextureSampleType,
  TDimension extends GPUTextureDimension,
  TMultisampled extends boolean,
> extends BaseData, BaseTextureProps {
  readonly [$repr]: this;
  readonly type: 'sampled-texture';

  readonly sampleType: TSample;
  readonly dimension: TDimension;
  readonly multisampled: TMultisampled;
}

export interface WgslStorageTexture<
  TFormat extends GPUTextureFormat,
  TAccess extends GPUStorageTextureAccess,
> extends BaseData, BaseTextureProps {
  readonly [$repr]: this;
  readonly type: 'storage-texture';
  readonly format: TFormat;
  readonly access: TAccess;
}
