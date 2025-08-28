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

type WithDefaults<TPartial, TDefaults> =
  & Omit<TDefaults, keyof TPartial>
  & TPartial;

type ResolvedTextureProps<
  TProps extends Partial<WgslTextureProps>,
> = WithDefaults<TProps, WgslTextureProps>;

type ResolvedStorageTextureProps<
  TProps extends Partial<WgslStorageTextureProps>,
> = WithDefaults<TProps, WgslStorageTextureProps>;

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

export interface WgslTexture<
  TProps extends Partial<WgslTextureProps> = WgslTextureProps,
> extends BaseData {
  readonly [$repr]: this;
  readonly type: SampledTextureLiteral;

  readonly sampleType: ResolvedTextureProps<TProps>['sampleType'];
  readonly dimension: ResolvedTextureProps<TProps>['dimension'];
  readonly multisampled: ResolvedTextureProps<TProps>['multisampled'];
  readonly bindingSampleType: [GPUTextureSampleType, ...GPUTextureSampleType[]];
}

export interface WgslStorageTexture<
  TProps extends Partial<WgslStorageTextureProps> = WgslStorageTextureProps,
> extends BaseData {
  readonly [$repr]: this;
  readonly type: StorageTextureLiteral;

  readonly format: ResolvedStorageTextureProps<TProps>['format'];
  readonly dimension: ResolvedStorageTextureProps<TProps>['dimension'];
  readonly access: ResolvedStorageTextureProps<TProps>['access'];
}

export interface WgslExternalTexture extends BaseData {
  readonly [$repr]: this;
  readonly type: 'texture_external';

  readonly dimension: '2d';
}

export interface WgslTexture1d<
  TSample extends PrimitiveNumericData = PrimitiveNumericData,
> extends
  WgslTexture<{
    dimension: '1d';
    sampleType: TSample;
    multisampled: false;
  }> {
  readonly type: 'texture_1d';
}

export interface WgslTexture2d<
  TSample extends PrimitiveNumericData = PrimitiveNumericData,
> extends
  WgslTexture<{
    dimension: '2d';
    sampleType: TSample;
    multisampled: false;
  }> {
  readonly type: 'texture_2d';
}

export interface WgslTextureMultisampled2d<
  TSample extends PrimitiveNumericData = PrimitiveNumericData,
> extends
  WgslTexture<{
    dimension: '2d';
    sampleType: TSample;
    multisampled: true;
  }> {
  readonly type: 'texture_multisampled_2d';
}

export interface WgslTexture2dArray<
  TSample extends PrimitiveNumericData = PrimitiveNumericData,
> extends
  WgslTexture<{
    dimension: '2d-array';
    sampleType: TSample;
    multisampled: false;
  }> {
  readonly type: 'texture_2d_array';
}

export interface WgslTextureCube<
  TSample extends PrimitiveNumericData = PrimitiveNumericData,
> extends
  WgslTexture<{
    dimension: 'cube';
    sampleType: TSample;
    multisampled: false;
  }> {
  readonly type: 'texture_cube';
}

export interface WgslTextureCubeArray<
  TSample extends PrimitiveNumericData = PrimitiveNumericData,
> extends
  WgslTexture<{
    dimension: 'cube-array';
    sampleType: TSample;
    multisampled: false;
  }> {
  readonly type: 'texture_cube_array';
}

export interface WgslTexture3d<
  TSample extends PrimitiveNumericData = PrimitiveNumericData,
> extends
  WgslTexture<{
    dimension: '3d';
    sampleType: TSample;
    multisampled: false;
  }> {
  readonly type: 'texture_3d';
}

// Depth textures (sample type is always f32)
export interface WgslTextureDepth2d extends
  WgslTexture<{
    dimension: '2d';
    sampleType: typeof f32;
    multisampled: false;
  }> {
  readonly type: 'texture_depth_2d';
}

export interface WgslTextureDepthMultisampled2d extends
  WgslTexture<{
    dimension: '2d';
    sampleType: typeof f32;
    multisampled: true;
  }> {
  readonly type: 'texture_depth_multisampled_2d';
}

export interface WgslTextureDepth2dArray extends
  WgslTexture<{
    dimension: '2d-array';
    sampleType: typeof f32;
    multisampled: false;
  }> {
  readonly type: 'texture_depth_2d_array';
}

export interface WgslTextureDepthCube extends
  WgslTexture<{
    dimension: 'cube';
    sampleType: typeof f32;
    multisampled: false;
  }> {
  readonly type: 'texture_depth_cube';
}

export interface WgslTextureDepthCubeArray extends
  WgslTexture<{
    dimension: 'cube-array';
    sampleType: typeof f32;
    multisampled: false;
  }> {
  readonly type: 'texture_depth_cube_array';
}

// Storage textures
export interface WgslStorageTexture1d<
  TFormat extends StorageTextureFormats = StorageTextureFormats,
  TAccess extends GPUStorageTextureAccess = GPUStorageTextureAccess,
> extends
  WgslStorageTexture<{
    dimension: '1d';
    format: TFormat;
    access: TAccess;
  }> {
  readonly type: 'texture_storage_1d';
}

export interface WgslStorageTexture2d<
  TFormat extends StorageTextureFormats = StorageTextureFormats,
  TAccess extends GPUStorageTextureAccess = GPUStorageTextureAccess,
> extends
  WgslStorageTexture<{
    dimension: '2d';
    format: TFormat;
    access: TAccess;
  }> {
  readonly type: 'texture_storage_2d';
}

export interface WgslStorageTexture2dArray<
  TFormat extends StorageTextureFormats = StorageTextureFormats,
  TAccess extends GPUStorageTextureAccess = GPUStorageTextureAccess,
> extends
  WgslStorageTexture<{
    dimension: '2d-array';
    format: TFormat;
    access: TAccess;
  }> {
  readonly type: 'texture_storage_2d_array';
}

export interface WgslStorageTexture3d<
  TFormat extends StorageTextureFormats = StorageTextureFormats,
  TAccess extends GPUStorageTextureAccess = GPUStorageTextureAccess,
> extends
  WgslStorageTexture<{
    dimension: '3d';
    format: TFormat;
    access: TAccess;
  }> {
  readonly type: 'texture_storage_3d';
}

function createTexture<TProps extends WgslTextureProps>(
  type: SampledTextureLiteral,
  props: TProps,
): WgslTexture<TProps> {
  const isDepth = type.startsWith('texture_depth');
  const sampleTypes: [GPUTextureSampleType, ...GPUTextureSampleType[]] = isDepth
    ? ['depth', 'float', 'unfilterable-float']
    : props.sampleType.type === 'i32'
    ? ['sint']
    : props.sampleType.type === 'u32'
    ? ['uint']
    : ['float', 'unfilterable-float'];

  return {
    [$internal]: true,
    [$repr]: undefined as unknown as WgslTexture<TProps>,
    type,
    bindingSampleType: sampleTypes,
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

export const accessModeMap: Record<GPUStorageTextureAccess, string> = {
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
    })) as WgslTexture1d<T>;
}

export function texture2d<T extends PrimitiveNumericData>(sampleType: T) {
  const key = `texture_2d<${sampleType.type}>`;
  return getOrCreate(key, () =>
    createTexture('texture_2d', {
      dimension: '2d',
      sampleType,
      multisampled: false,
    })) as WgslTexture2d<T>;
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
    })) as WgslTextureMultisampled2d<T>;
}

export function texture2dArray<T extends PrimitiveNumericData>(sampleType: T) {
  const key = `texture_2d_array<${sampleType.type}>`;
  return getOrCreate(key, () =>
    createTexture('texture_2d_array', {
      dimension: '2d-array',
      sampleType,
      multisampled: false,
    })) as WgslTexture2dArray<T>;
}

export function textureCube<T extends PrimitiveNumericData>(sampleType: T) {
  const key = `texture_cube<${sampleType.type}>`;
  return getOrCreate(key, () =>
    createTexture('texture_cube', {
      dimension: 'cube',
      sampleType,
      multisampled: false,
    })) as WgslTextureCube<T>;
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
    })) as WgslTextureCubeArray<T>;
}

export function texture3d<T extends PrimitiveNumericData>(sampleType: T) {
  const key = `texture_3d<${sampleType.type}>`;
  return getOrCreate(key, () =>
    createTexture('texture_3d', {
      dimension: '3d',
      sampleType,
      multisampled: false,
    })) as WgslTexture3d<T>;
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
    })) as WgslStorageTexture1d<TFormat, TAccess>;
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
    })) as WgslStorageTexture2d<TFormat, TAccess>;
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
  ) as WgslStorageTexture2dArray<TFormat, TAccess>;
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
    })) as WgslStorageTexture3d<TFormat, TAccess>;
}

export function textureDepth2d() {
  const key = 'texture_depth_2d';
  return getOrCreate(key, () =>
    createTexture('texture_depth_2d', {
      dimension: '2d',
      sampleType: f32,
      multisampled: false,
    })) as WgslTextureDepth2d;
}

export function textureDepthMultisampled2d() {
  const key = 'texture_depth_multisampled_2d';
  return getOrCreate(key, () =>
    createTexture('texture_depth_multisampled_2d', {
      dimension: '2d',
      sampleType: f32,
      multisampled: true,
    })) as WgslTextureDepthMultisampled2d;
}

export function textureDepth2dArray() {
  const key = 'texture_depth_2d_array';
  return getOrCreate(key, () =>
    createTexture('texture_depth_2d_array', {
      dimension: '2d-array',
      sampleType: f32,
      multisampled: false,
    })) as WgslTextureDepth2dArray;
}

export function textureDepthCube() {
  const key = 'texture_depth_cube';
  return getOrCreate(key, () =>
    createTexture('texture_depth_cube', {
      dimension: 'cube',
      sampleType: f32,
      multisampled: false,
    })) as WgslTextureDepthCube;
}

export function textureDepthCubeArray() {
  const key = 'texture_depth_cube_array';
  return getOrCreate(key, () =>
    createTexture('texture_depth_cube_array', {
      dimension: 'cube-array',
      sampleType: f32,
      multisampled: false,
    })) as WgslTextureDepthCubeArray;
}

export function textureExternal() {
  const key = 'texture_external';
  return getOrCreate(key, () => ({
    [$internal]: true,
    [$repr]: undefined as unknown as WgslExternalTexture,
    type: 'texture_external',
    dimension: '2d',
  })) as WgslExternalTexture;
}

export function isWgslTexture(value: unknown): value is WgslTexture {
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
