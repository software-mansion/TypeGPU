import type { StorageTextureFormats } from '../core/texture/textureFormats.ts';
import { $internal, $repr } from '../shared/symbols.ts';
import { f32 } from './index.ts';
import type { BaseData, PrimitiveNumericData } from './wgslTypes.ts';

type StorageTextureDimension = '1d' | '2d' | '2d-array' | '3d';

export type WgslTextureProps = {
  dimension: GPUTextureViewDimension;
  sampleType: PrimitiveNumericData;
  multisampled: boolean;
};

export type WgslStorageTextureProps = {
  dimension: StorageTextureDimension;
  format: StorageTextureFormats;
  access: GPUStorageTextureAccess;
};

type SampledTextureLiteral = `texture_${
  | '1d'
  | '2d'
  | '2d_array'
  | '3d'
  | 'cube'
  | 'cube_array'
  | 'multisampled_2d'
  | 'depth_multisampled_2d'
  | 'depth_2d'
  | 'depth_2d_array'
  | 'depth_cube'
  | 'depth_cube_array'}`;
type StorageTextureLiteral = `texture_storage_${
  | '1d'
  | '2d'
  | '2d_array'
  | '3d'}`;

export interface WgslTexture<TProps extends WgslTextureProps = WgslTextureProps>
  extends BaseData {
  readonly [$repr]: this;
  readonly type: SampledTextureLiteral;

  readonly sampleType: TProps['sampleType'];
  readonly dimension: TProps['dimension'];
  readonly multisampled: TProps['multisampled'];
}

export interface WgslStorageTexture<
  TProps extends WgslStorageTextureProps = WgslStorageTextureProps,
> extends BaseData {
  readonly [$repr]: this;
  readonly type: StorageTextureLiteral;

  readonly format: TProps['format'];
  readonly dimension: TProps['dimension'];
  readonly access: TProps['access'];
}

export interface WgslExternalTexture extends BaseData {
  readonly [$repr]: this;
  readonly type: 'texture_external';

  readonly dimension: '2d';
}

function createTexture<TProps extends WgslTextureProps>(
  type: SampledTextureLiteral,
  props: TProps,
): WgslTexture<TProps> {
  return {
    [$internal]: true,
    [$repr]: undefined as unknown as WgslTexture<TProps>,
    type,
    ...props,
  };
}

function createStorageTexture<TProps extends WgslStorageTextureProps>(
  type: StorageTextureLiteral,
  props: TProps,
): WgslStorageTexture<TProps> {
  return {
    [$internal]: true,
    [$repr]: undefined as unknown as WgslStorageTexture<TProps>,
    type,
    ...props,
  };
}

const textureCache = new Map<
  string,
  WgslTexture | WgslStorageTexture | WgslExternalTexture
>();

const accessModeMap: Record<GPUStorageTextureAccess, string> = {
  'write-only': 'write',
  'read-only': 'read',
  'read-write': 'read_write',
};

function getOrCreate<
  T extends WgslTexture | WgslStorageTexture | WgslExternalTexture,
>(key: string, factory: () => T): T {
  let cached = textureCache.get(key) as T | undefined;
  if (!cached) {
    cached = factory();
    textureCache.set(key, cached);
  }
  return cached;
}

export function texture1d<T extends PrimitiveNumericData>(sampleType: T) {
  const key = `texture_1d<${sampleType.type}>`;
  return getOrCreate(key, () =>
    createTexture('texture_1d', {
      dimension: '1d',
      sampleType,
      multisampled: false,
    }));
}

export function texture2d<T extends PrimitiveNumericData>(sampleType: T) {
  const key = `texture_2d<${sampleType.type}>`;
  return getOrCreate(key, () =>
    createTexture('texture_2d', {
      dimension: '2d',
      sampleType,
      multisampled: false,
    }));
}

export function textureMultisampled2d<T extends PrimitiveNumericData>(
  sampleType: T,
) {
  const key = `texture_multisampled_2d<${sampleType.type}>`;
  return getOrCreate(key, () =>
    createTexture('texture_multisampled_2d', {
      dimension: '2d',
      sampleType,
      multisampled: true,
    }));
}

export function texture2dArray<T extends PrimitiveNumericData>(sampleType: T) {
  const key = `texture_2d_array<${sampleType.type}>`;
  return getOrCreate(key, () =>
    createTexture('texture_2d_array', {
      dimension: '2d-array',
      sampleType,
      multisampled: false,
    }));
}

export function textureCube<T extends PrimitiveNumericData>(sampleType: T) {
  const key = `texture_cube<${sampleType.type}>`;
  return getOrCreate(key, () =>
    createTexture('texture_cube', {
      dimension: 'cube',
      sampleType,
      multisampled: false,
    }));
}

export function textureCubeArray<T extends PrimitiveNumericData>(
  sampleType: T,
) {
  const key = `texture_cube_array<${sampleType.type}>`;
  return getOrCreate(key, () =>
    createTexture('texture_cube_array', {
      dimension: 'cube-array',
      sampleType,
      multisampled: false,
    }));
}

export function texture3d<T extends PrimitiveNumericData>(sampleType: T) {
  const key = `texture_3d<${sampleType.type}>`;
  return getOrCreate(key, () =>
    createTexture('texture_3d', {
      dimension: '3d',
      sampleType,
      multisampled: false,
    }));
}

export function textureStorage1d<
  TFormat extends StorageTextureFormats,
  TAccess extends GPUStorageTextureAccess,
>(format: TFormat, access: TAccess) {
  const key = `texture_storage_1d<${format}, ${accessModeMap[access]}>`;
  return getOrCreate(key, () =>
    createStorageTexture('texture_storage_1d', {
      dimension: '1d',
      format,
      access,
    }));
}

export function textureStorage2d<
  TFormat extends StorageTextureFormats,
  TAccess extends GPUStorageTextureAccess,
>(format: TFormat, access: TAccess) {
  const key = `texture_storage_2d<${format}, ${accessModeMap[access]}>`;
  return getOrCreate(key, () =>
    createStorageTexture('texture_storage_2d', {
      dimension: '2d',
      format,
      access,
    }));
}

export function textureStorage2dArray<
  TFormat extends StorageTextureFormats,
  TAccess extends GPUStorageTextureAccess,
>(format: TFormat, access: TAccess) {
  const key = `texture_storage_2d_array<${format}, ${accessModeMap[access]}>`;
  return getOrCreate(
    key,
    () =>
      createStorageTexture('texture_storage_2d_array', {
        dimension: '2d-array',
        format,
        access,
      }),
  );
}

export function textureStorage3d<
  TFormat extends StorageTextureFormats,
  TAccess extends GPUStorageTextureAccess,
>(format: TFormat, access: TAccess) {
  const key = `texture_storage_3d<${format}, ${accessModeMap[access]}>`;
  return getOrCreate(key, () =>
    createStorageTexture('texture_storage_3d', {
      dimension: '3d',
      format,
      access,
    }));
}

export function textureDepth2d() {
  const key = 'texture_depth_2d';
  return getOrCreate(key, () =>
    createTexture('texture_depth_2d', {
      dimension: '2d',
      sampleType: f32,
      multisampled: false,
    }));
}

export function textureDepthMultisampled2d() {
  const key = 'texture_depth_multisampled_2d';
  return getOrCreate(key, () =>
    createTexture('texture_depth_multisampled_2d', {
      dimension: '2d',
      sampleType: f32,
      multisampled: true,
    }));
}

export function textureDepth2dArray() {
  const key = 'texture_depth_2d_array';
  return getOrCreate(key, () =>
    createTexture('texture_depth_2d_array', {
      dimension: '2d-array',
      sampleType: f32,
      multisampled: false,
    }));
}

export function textureDepthCube() {
  const key = 'texture_depth_cube';
  return getOrCreate(key, () =>
    createTexture('texture_depth_cube', {
      dimension: 'cube',
      sampleType: f32,
      multisampled: false,
    }));
}

export function textureDepthCubeArray() {
  const key = 'texture_depth_cube_array';
  return getOrCreate(key, () =>
    createTexture('texture_depth_cube_array', {
      dimension: 'cube-array',
      sampleType: f32,
      multisampled: false,
    }));
}

export function textureExternal() {
  const key = 'texture_external';
  return getOrCreate(key, () => ({
    [$internal]: true,
    [$repr]: undefined as unknown as WgslExternalTexture,
    type: 'texture_external',
    dimension: '2d',
  }));
}

export function isWgslSampledTexture(value: unknown): value is WgslTexture {
  return (
    !!(value as WgslTexture)[$internal] &&
    typeof (value as WgslTexture).multisampled === 'boolean'
  );
}

export function isWgslStorageTexture(
  value: unknown,
): value is WgslStorageTexture {
  return (
    !!(value as WgslStorageTexture)[$internal] &&
    typeof (value as WgslStorageTexture).format === 'string' &&
    typeof (value as WgslStorageTexture).access === 'string'
  );
}

export function isWgslExternalTexture(
  value: unknown,
): value is WgslExternalTexture {
  return (
    !!(value as WgslExternalTexture)[$internal] &&
    (value as WgslExternalTexture).type === 'texture_external'
  );
}
