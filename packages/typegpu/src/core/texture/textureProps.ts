export type TextureProps = {
  size: readonly number[];
  format: GPUTextureFormat;
  viewFormats?: GPUTextureFormat[] | undefined;
  dimension?: GPUTextureDimension | undefined;
  mipLevelCount?: number | undefined;
  sampleCount?: number | undefined;
};
