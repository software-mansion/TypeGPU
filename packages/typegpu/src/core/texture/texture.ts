import type { F32, I32, U32 } from '../../data';
import {
  type Vec4f,
  type Vec4i,
  type Vec4u,
  vec4f,
  vec4i,
  vec4u,
} from '../../data/vector';
import type { TgpuNamable } from '../../namable';
import type { SampledTextureParams } from '../../textureTypes';
import type {
  LayoutMembership,
  TgpuBindGroupLayout,
} from '../../tgpuBindGroupLayout';
import { code } from '../../tgpuCode';
import { identifier } from '../../tgpuIdentifier';
import type { ResolutionCtx, TgpuResolvable } from '../../types';
import type { Default } from '../../utilityTypes';
import type { UnionToIntersection } from '../../utilityTypes';
import type { TgpuLaidOut } from '../bindGroup/laidOut';

// ----------
// Public API
// ----------

export type TexelScalarData = U32 | I32 | F32;
export type TexelData = Vec4u | Vec4i | Vec4f;

export interface SampledTexture {
  usableAsSampledTexture: true;

  asSampled(params: SampledTextureParams): TgpuSampledTexture;
}

export type TextureProps = {
  format: StorageTextureTexelFormat;
  viewFormats: StorageTextureTexelFormat[];
  dimension: StorageTextureDimension;
};

export interface StorageTexture<TProps extends TextureProps> {
  usableAsStorageTexture: true;

  asReadonly<
    TFormat extends
      | TProps['format']
      | TProps['viewFormats'][number]
      | undefined,
    TDimension extends StorageTextureDimension | undefined,
  >(
    params: StorageTextureParams<TFormat, TDimension>,
  ): TgpuReadonlyTexture<
    TexelFormatToDataType[Default<TFormat, TProps['format']>],
    Default<TDimension, TProps['dimension']>
  >;
}

export interface INVALID<TMsg extends string> {
  invalid: TMsg;
}

export interface RenderTexture {
  usableAsRenderTexture: true;
}

type LiteralToUsageType<
  T extends 'sampled' | 'storage' | 'render',
  TProps extends TextureProps,
> = T extends 'sampled'
  ? SampledTexture
  : T extends 'storage'
    ? StorageTexture<TProps>
    : T extends 'render'
      ? RenderTexture
      : never;

/**
 * @param TFormat used to track the texture's default format. Will be inherited by any view created without an explicit format override.
 * @param TViewFormats additional formats that views can choose.
 */
export interface TgpuTexture<TProps extends TextureProps = TextureProps>
  extends TgpuNamable {
  readonly label: string | undefined;

  $usage<T extends ('sampled' | 'storage' | 'render')[]>(
    ...usages: T
  ): this & UnionToIntersection<LiteralToUsageType<T[number], TProps>>;
}

export type StorageTextureAccess = 'readonly' | 'writeonly' | 'mutable';

/**
 * Based on @see GPUTextureViewDimension
 * https://www.w3.org/TR/WGSL/#texture-depth
 */
export type StorageTextureDimension =
  | '1d'
  | '2d'
  | '2d-array'
  // | 'cube' <- not supported by storage textures
  // | 'cube-array'<- not supported by storage textures
  | '3d';

export type StorageTextureParams<
  TFormat extends GPUTextureFormat | undefined,
  TDimension extends StorageTextureDimension | undefined,
> = {
  format?: TFormat;
  dimension?: TDimension;
  extra?: GPUTextureViewDescriptor;
};

export interface TgpuStorageTexture<
  TData extends TexelData = TexelData,
  TDimension extends StorageTextureDimension = StorageTextureDimension,
> {
  texelDataType: TData;
  dimension: TDimension;
  access: StorageTextureAccess;
}

/**
 * A texture accessed as "readonly" storage on the GPU.
 */
export interface TgpuReadonlyTexture<
  TData extends TexelData = TexelData,
  TDimension extends StorageTextureDimension = StorageTextureDimension,
> extends TgpuStorageTexture<TData, TDimension>,
    TgpuResolvable {
  access: 'readonly';
}

/**
 * A texture accessed as "writeonly" storage on the GPU.
 */
export interface TgpuWriteonlyTexture<
  TData extends TexelData = TexelData,
  TDimension extends StorageTextureDimension = StorageTextureDimension,
> extends TgpuStorageTexture<TData, TDimension>,
    TgpuResolvable {
  access: 'writeonly';
}

/**
 * A texture accessed as "mutable" (or read_write) storage on the GPU.
 */
export interface TgpuMutableTexture<
  TData extends TexelData = TexelData,
  TDimension extends StorageTextureDimension = StorageTextureDimension,
> extends TgpuStorageTexture<TData, TDimension>,
    TgpuResolvable {
  access: 'mutable';
}

/**
 * A texture accessed as "sampled" on the GPU.
 */
export interface TgpuSampledTexture extends TgpuResolvable {}

/**
 * https://www.w3.org/TR/WGSL/#storage-texel-formats
 */
export type StorageTextureTexelFormat =
  | 'rgba8unorm'
  | 'rgba8snorm'
  | 'rgba8uint'
  | 'rgba8sint'
  | 'rgba16uint'
  | 'rgba16sint'
  | 'rgba16float'
  | 'r32uint'
  | 'r32sint'
  | 'r32float'
  | 'rg32uint'
  | 'rg32sint'
  | 'rg32float'
  | 'rgba32uint'
  | 'rgba32sint'
  | 'rgba32float'
  | 'bgra8unorm';

const texelFormatToTgpuType = {
  rgba8unorm: vec4f,
  rgba8snorm: vec4f,
  rgba8uint: vec4u,
  rgba8sint: vec4i,
  rgba16uint: vec4u,
  rgba16sint: vec4i,
  rgba16float: vec4f,
  r32uint: vec4u,
  r32sint: vec4i,
  r32float: vec4f,
  rg32uint: vec4u,
  rg32sint: vec4i,
  rg32float: vec4f,
  rgba32uint: vec4u,
  rgba32sint: vec4i,
  rgba32float: vec4f,
  bgra8unorm: vec4f,
} as const;

type TexelFormatToDataType = typeof texelFormatToTgpuType;

// --------------
// Implementation
// --------------

class TgpuTextureImpl<TProps extends TextureProps>
  implements TgpuTexture<TProps>
{
  private _label: string | undefined;
  private _flags = 0;
  public usableAsSampledTexture = false;
  public usableAsStorageTexture = false;
  public usableAsRenderTexture = false;

  constructor(
    public readonly descriptor: Omit<GPUTextureDescriptor, 'usage'>,
  ) {}

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  $usage<T extends ('sampled' | 'storage' | 'render')[]>(
    ...usages: T
  ): this & UnionToIntersection<LiteralToUsageType<T[number], TProps>> {
    const hasStorage = usages.includes('storage');
    const hasSampled = usages.includes('sampled');
    const hasRender = usages.includes('render');
    this._flags |= hasSampled ? GPUTextureUsage.TEXTURE_BINDING : 0;
    this._flags |= hasStorage ? GPUTextureUsage.STORAGE_BINDING : 0;
    this._flags |= hasRender ? GPUTextureUsage.RENDER_ATTACHMENT : 0;
    this.usableAsStorageTexture ||= hasStorage;
    this.usableAsSampledTexture ||= hasSampled;
    this.usableAsRenderTexture ||= hasRender;

    return this as this &
      UnionToIntersection<LiteralToUsageType<T[number], TProps>>;
  }

  asReadonly() {}

  private getStorageIfAllowed(
    params: StorageTextureParams,
  ): TgpuTextureView<TexelFormat, 'storage'> | null {
    if (!this._allowedUsages.storage) {
      return null;
    }
    const stringified = hashFromShallowObj(params);
    const existing = this._allowedUsages.storage.get(stringified);
    if (existing) {
      return existing;
    }
    const type = texelFormatToTgpuType[this.descriptor.format];
    if (!type) {
      throw new Error(`Unsupported texture format ${this.descriptor.format}`);
    }
    const view = new TgpuTextureViewImpl(
      params.type,
      this,
      type,
      params.descriptor,
      params.access,
    ) as unknown as TgpuTextureView<typeof type, 'storage'>;
    this._allowedUsages.storage.set(stringified, view);
    return view;
  }

  private getSampledIfAllowed(
    params: SampledTextureParams,
  ): TgpuTextureView<TextureScalarFormat, 'sampled'> | null {
    if (!this._allowedUsages.sampled) {
      return null;
    }
    const stringified = hashFromShallowObj({
      type: params.type,
      dataType: String(params.dataType),
    });
    const existing = this._allowedUsages.sampled.get(stringified);
    if (existing) {
      return existing;
    }
    const view = new TgpuTextureViewImpl(
      params.type,
      this,
      params.dataType,
      params.descriptor,
    ) as unknown as TgpuTextureView<typeof params.dataType, 'sampled'>;
    this._allowedUsages.sampled.set(stringified, view);
    return view;
  }

  asStorage(params: StorageTextureParams) {
    const maybeView = this.getStorageIfAllowed(params);
    const maybeType = texelFormatToTgpuType[this.descriptor.format];
    if (!maybeType) {
      throw new Error(`Unsupported texture format ${this.descriptor.format}`);
    }
    return maybeView as 'storage' extends TAllows
      ? TgpuTextureView<typeof maybeType, 'storage'>
      : null;
  }

  asSampled(params: SampledTextureParams) {
    return this.getSampledIfAllowed(params) as 'sampled' extends TAllows
      ? TgpuTextureView<typeof params.dataType, 'sampled'>
      : null;
  }
}

const accessToCodeMap = {
  readonly: 'read',
  writeonly: 'write',
  mutable: 'read_write',
};

class TgpuBindableStorageTextureImpl<
  TFormat extends StorageTextureTexelFormat = StorageTextureTexelFormat,
  TDimension extends StorageTextureDimension = StorageTextureDimension,
> implements TgpuStorageTexture<TexelFormatToDataType[TFormat], TDimension>
{
  public readonly texelDataType: TexelFormatToDataType[TFormat];

  constructor(
    public readonly dimension: TDimension,
    public readonly access: StorageTextureAccess,
    private readonly _format: TFormat,
    private readonly _texture: TgpuTexture,
  ) {
    this.texelDataType = texelFormatToTgpuType[
      _format
    ] as TexelFormatToDataType[TFormat];
  }

  get label() {
    return this._texture.label;
  }

  $name(label: string) {
    this._texture.$name(label);
  }

  resolve(ctx: ResolutionCtx): string {
    const ident = identifier().$name(this.label);
    const { group, binding } = ctx.registerBindable(this);

    ctx.addDeclaration(
      code`@group(${group}) @binding(${binding}) var ${ident}: texture_storage<${this._format}, ${accessToCodeMap[this.access]}>;`,
    );

    return ctx.resolve(ident);
  }
}

export class TgpuLaidOutStorageTextureImpl<
  TFormat extends StorageTextureTexelFormat = StorageTextureTexelFormat,
  TDimension extends StorageTextureDimension = StorageTextureDimension,
> implements
    TgpuStorageTexture<TexelFormatToDataType[TFormat], TDimension>,
    TgpuLaidOut
{
  public readonly layout: TgpuBindGroupLayout;
  public readonly texelDataType: TexelFormatToDataType[TFormat];

  constructor(
    public readonly dimension: TDimension,
    public readonly access: StorageTextureAccess,
    private readonly _format: TFormat,
    private readonly _membership: LayoutMembership,
  ) {
    this.layout = _membership.layout;
    this.texelDataType = texelFormatToTgpuType[
      _format
    ] as TexelFormatToDataType[TFormat];
  }

  get label() {
    return this._membership.key;
  }

  resolve(ctx: ResolutionCtx): string {
    const ident = identifier().$name(this._membership.key);
    const group = ctx.registerLaidOut(this);

    ctx.addDeclaration(
      code`@group(${group}) @binding(${this._membership.idx}) var ${ident}: texture_storage<${this._format}, ${accessToCodeMap[this.access]}>;`,
    );

    return ctx.resolve(ident);
  }
}
