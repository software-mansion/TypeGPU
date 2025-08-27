import type { StorageTextureFormats } from '../core/texture/textureFormats.ts';
import { $internal, $repr } from '../shared/symbols.ts';
import type { BaseData } from './wgslTypes.ts';

type StorageTextureDimension =
  | '1d'
  | '2d'
  | '2d-array'
  | '3d';

type BaseTextureProps = {
  readonly aspect: GPUTextureAspect;
  readonly baseMipLevel: number;
  readonly baseArrayLayer: number;
  readonly mipLevelCount?: number | undefined;
  readonly arrayLayerCount?: number | undefined;
  readonly format?: GPUTextureFormat | undefined;
};

// TODO: remove this comment
// maybe a little overkill for just the two cases (2d-array and cube-array) but I don't care it's cool
type DashToUnderscore<S extends string> = S extends `${infer L}-${infer R}`
  ? `${L}_${DashToUnderscore<R>}`
  : S;
function dashToUnderscore<S extends string>(s: S): DashToUnderscore<S> {
  return s.replace(/-/g, '_') as DashToUnderscore<S>;
}

// Infer-from-props helpers (non-distributive, avoid unions with undefined)
type PropOf<T, K extends PropertyKey> = K extends keyof T ? T[K] : undefined;
type DefaultProp<T, K extends PropertyKey, Expected, D> = [
  PropOf<T, K>,
] extends [Expected] ? PropOf<T, K>
  : D;

type SampledTextureType<
  TDimension extends GPUTextureViewDimension,
  TSample extends GPUTextureSampleType,
  TMultisampled extends boolean,
> = TMultisampled extends true
  ? TDimension extends '2d'
    ? TSample extends 'depth' ? 'texture_depth_multisampled_2d'
    : 'texture_multisampled_2d'
  : never
  : TSample extends 'depth'
    ? TDimension extends '2d' | '2d-array' | 'cube' | 'cube-array'
      ? `texture_depth_${DashToUnderscore<TDimension>}`
    : never
  : `texture_${DashToUnderscore<TDimension>}`;

function sampledTextureType<
  TDimension extends GPUTextureViewDimension,
  TSample extends GPUTextureSampleType,
  TMultisampled extends boolean,
>(
  viewDimension: TDimension,
  sampleType: TSample,
  multisampled: TMultisampled,
): SampledTextureType<TDimension, TSample, TMultisampled> {
  if (multisampled) {
    if (viewDimension !== '2d') {
      throw new Error(
        'Multisampled textures are only supported for 2d dimension',
      );
    }
    return (sampleType === 'depth'
      ? 'texture_depth_multisampled_2d'
      : 'texture_multisampled_2d') as SampledTextureType<
        TDimension,
        TSample,
        TMultisampled
      >;
  }

  if (sampleType === 'depth') {
    if (!['2d', '2d-array', 'cube', 'cube-array'].includes(viewDimension)) {
      throw new Error(
        `Depth textures are not supported for dimension: ${viewDimension}`,
      );
    }
    return `texture_depth_${
      dashToUnderscore(viewDimension)
    }` as SampledTextureType<
      TDimension,
      TSample,
      TMultisampled
    >;
  }

  return `texture_${dashToUnderscore(viewDimension)}` as SampledTextureType<
    TDimension,
    TSample,
    TMultisampled
  >;
}

type StorageTextureType<
  TDimension extends StorageTextureDimension,
> = `texture_storage_${DashToUnderscore<TDimension>}`;

function storageTextureType<
  TDimension extends StorageTextureDimension,
>(viewDimension: TDimension): StorageTextureType<TDimension> {
  return `texture_storage_${
    dashToUnderscore(viewDimension)
  }` as StorageTextureType<
    TDimension
  >;
}

type SampledTextureProps<
  TDimension extends GPUTextureViewDimension,
  TSample extends GPUTextureSampleType,
  TMultisampled extends boolean = false,
> = {
  viewDimension?: TDimension;
  sampleType?: TSample;
  multisampled?: TMultisampled;
} & Partial<BaseTextureProps>;

export function sampledTexture<
  P extends SampledTextureProps<
    GPUTextureViewDimension,
    GPUTextureSampleType,
    boolean
  > = Record<string, never>,
>(
  props?: P,
): WgslSampledTexture<
  DefaultProp<P, 'viewDimension', GPUTextureViewDimension, '2d'>,
  DefaultProp<P, 'sampleType', GPUTextureSampleType, 'float'>,
  DefaultProp<P, 'multisampled', boolean, false>
> {
  const {
    viewDimension = '2d' as GPUTextureViewDimension,
    sampleType = 'float' as GPUTextureSampleType,
    multisampled = false as boolean,
  } = (props ?? {}) as SampledTextureProps<
    GPUTextureViewDimension,
    GPUTextureSampleType,
    boolean
  >;

  return {
    [$internal]: true,
    [$repr]: undefined as unknown as WgslSampledTexture<
      DefaultProp<P, 'viewDimension', GPUTextureViewDimension, '2d'>,
      DefaultProp<P, 'sampleType', GPUTextureSampleType, 'float'>,
      DefaultProp<P, 'multisampled', boolean, false>
    >,
    type: sampledTextureType(
      viewDimension,
      sampleType,
      multisampled,
    ) as SampledTextureType<
      DefaultProp<P, 'viewDimension', GPUTextureViewDimension, '2d'>,
      DefaultProp<P, 'sampleType', GPUTextureSampleType, 'float'>,
      DefaultProp<P, 'multisampled', boolean, false>
    >,
    viewDimension: viewDimension as DefaultProp<
      P,
      'viewDimension',
      GPUTextureViewDimension,
      '2d'
    >,
    sampleType: sampleType as DefaultProp<
      P,
      'sampleType',
      GPUTextureSampleType,
      'float'
    >,
    multisampled: multisampled as DefaultProp<
      P,
      'multisampled',
      boolean,
      false
    >,
    aspect: props?.aspect ?? 'all',
    baseMipLevel: props?.baseMipLevel ?? 0,
    mipLevelCount: props?.mipLevelCount,
    baseArrayLayer: props?.baseArrayLayer ?? 0,
    arrayLayerCount: props?.arrayLayerCount,
  };
}

type StorageTextureProps<
  TFormat extends GPUTextureFormat,
  TDimension extends StorageTextureDimension = '2d',
  TAccess extends GPUStorageTextureAccess = 'write-only',
> = {
  format: TFormat;
  viewDimension?: TDimension;
  access?: TAccess;
} & Partial<Omit<BaseTextureProps, 'format'>>;

export function storageTexture<
  P extends StorageTextureProps<
    StorageTextureFormats,
    StorageTextureDimension,
    GPUStorageTextureAccess
  >,
>(
  props: P,
): WgslStorageTexture<
  DefaultProp<P, 'viewDimension', StorageTextureDimension, '2d'>,
  P['format'],
  DefaultProp<P, 'access', GPUStorageTextureAccess, 'write-only'>
> {
  const {
    format,
    viewDimension = '2d' as StorageTextureDimension,
    access = 'write-only' as GPUStorageTextureAccess,
  } = props as StorageTextureProps<
    StorageTextureFormats,
    StorageTextureDimension,
    GPUStorageTextureAccess
  >;

  return {
    [$internal]: true,
    [$repr]: undefined as unknown as WgslStorageTexture<
      DefaultProp<P, 'viewDimension', StorageTextureDimension, '2d'>,
      P['format'],
      DefaultProp<P, 'access', GPUStorageTextureAccess, 'write-only'>
    >,
    type: storageTextureType(
      viewDimension,
    ) as StorageTextureType<
      DefaultProp<P, 'viewDimension', StorageTextureDimension, '2d'>
    >,
    format: format as P['format'],
    viewDimension: viewDimension as DefaultProp<
      P,
      'viewDimension',
      StorageTextureDimension,
      '2d'
    >,
    access: access as DefaultProp<
      P,
      'access',
      GPUStorageTextureAccess,
      'write-only'
    >,
    aspect: props?.aspect ?? 'all',
    baseMipLevel: props?.baseMipLevel ?? 0,
    mipLevelCount: props?.mipLevelCount,
    baseArrayLayer: props?.baseArrayLayer ?? 0,
    arrayLayerCount: props?.arrayLayerCount,
  };
}

export function externalTexture(): WgslExternalTexture {
  return {
    [$internal]: true,
    [$repr]: undefined as unknown as WgslExternalTexture,
    type: 'texture_external',
    viewDimension: '2d',
  };
}

export interface WgslSampledTexture<
  TDimension extends GPUTextureViewDimension = GPUTextureViewDimension,
  TSample extends GPUTextureSampleType = GPUTextureSampleType,
  TMultisampled extends boolean = boolean,
> extends BaseData, BaseTextureProps {
  readonly [$repr]: this;
  readonly type: SampledTextureType<TDimension, TSample, TMultisampled>;

  readonly sampleType: TSample;
  readonly viewDimension: TDimension;
  readonly multisampled: TMultisampled;
}

export interface WgslStorageTexture<
  TDimension extends StorageTextureDimension = StorageTextureDimension,
  TFormat extends StorageTextureFormats = StorageTextureFormats,
  TAccess extends GPUStorageTextureAccess = GPUStorageTextureAccess,
> extends BaseData, BaseTextureProps {
  readonly [$repr]: this;
  readonly type: StorageTextureType<TDimension>;

  readonly format: TFormat;
  readonly viewDimension: TDimension;
  readonly access: TAccess;
}

export interface WgslExternalTexture extends BaseData {
  readonly [$repr]: this;
  readonly type: 'texture_external';

  // External textures are always 2d
  // This props allows for easier type narrowing
  readonly viewDimension: '2d';
}

export function isWgslSampledTexture(
  value: unknown,
): value is WgslSampledTexture {
  return !!(value as WgslSampledTexture)[$internal] &&
    typeof (value as WgslSampledTexture).sampleType === 'string' &&
    typeof (value as WgslSampledTexture).multisampled === 'boolean';
}

export function isWgslStorageTexture(
  value: unknown,
): value is WgslStorageTexture {
  return !!(value as WgslStorageTexture)[$internal] &&
    typeof (value as WgslStorageTexture).format === 'string' &&
    typeof (value as WgslStorageTexture).access === 'string';
}

export function isWgslExternalTexture(
  value: unknown,
): value is WgslExternalTexture {
  return !!(value as WgslExternalTexture)[$internal] &&
    (value as WgslExternalTexture).type === 'texture_external';
}
