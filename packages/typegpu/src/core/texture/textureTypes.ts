import type { F32, I32, U32 } from '../../data';
import type { TgpuTypedTextureType } from '../../types';

export type StorageTextureAccess = 'read' | 'write' | 'read_write';
export type TextureScalarFormat = U32 | I32 | F32;

export type SampledTextureParams = {
  type: TgpuTypedTextureType;
  dataType: TextureScalarFormat;
  descriptor?: GPUTextureViewDescriptor;
};
