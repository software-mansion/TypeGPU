import type { F32, I32, U32, Vec4f, Vec4i, Vec4u } from './data';
import type { TgpuStorageTextureType, TgpuTypedTextureType } from './types';

export type StorageTextureAccess = 'read' | 'write' | 'read_write';
export type TextureScalarFormat = U32 | I32 | F32;
export type TexelFormat = Vec4u | Vec4i | Vec4f;

export type StorageTextureParams = {
  type: TgpuStorageTextureType;
  access: StorageTextureAccess;
  descriptor?: GPUTextureViewDescriptor;
};

export type SampledTextureParams = {
  type: TgpuTypedTextureType;
  dataType: TextureScalarFormat;
  descriptor?: GPUTextureViewDescriptor;
};
