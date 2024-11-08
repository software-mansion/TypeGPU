import type { F32, I32, U32 } from '../../data';
import type { Vec4f, Vec4i, Vec4u } from '../../data/vector';
import { invariant } from '../../errors';
import type { TgpuNamable } from '../../namable';
import { identifier } from '../../tgpuIdentifier';
import type { ResolutionCtx, TgpuResolvable } from '../../types';
import type { Default } from '../../utilityTypes';
import type { UnionToIntersection } from '../../utilityTypes';
import type { ExperimentalTgpuRoot } from '../root/rootTypes';
import {
  type StorageTextureTexelFormat,
  type TexelFormatToDataType,
  type TexelFormatToDataTypeOrNever,
  texelFormatToChannelType,
  texelFormatToDataType,
} from './textureFormats';

// ----------
// Public API
// ----------

export type ChannelData = U32 | I32 | F32;
export type TexelData = Vec4u | Vec4i | Vec4f;

export type TextureProps = {
  size: readonly number[];
  format: GPUTextureFormat;
  viewFormats?: GPUTextureFormat[] | undefined;
  dimension?: GPUTextureDimension | undefined;
  mipLevelCount?: number | undefined;
  sampleCount?: number | undefined;
};

/**
 * Represents what formats a storage view can choose from based on its owner texture's props.
 */
type StorageFormatOptions<TProps extends TextureProps> = Extract<
  TProps['format'] | Default<TProps['viewFormats'], []>[number],
  StorageTextureTexelFormat
>;

export interface StorageTexture<TProps extends TextureProps> {
  usableAsStorageTexture: true;

  asReadonly<
    TDimension extends StorageTextureDimension,
    // Limiting the possible choices to the default format
    // of this texture, or to any of the additional view formats.
    // (all limited to what is supported for storage textures)
    TFormat extends StorageFormatOptions<TProps>,
  >(
    params?: TextureViewParams<TDimension, TFormat>,
  ): TgpuReadonlyTexture<
    StorageTextureDimension extends TDimension
      ? Default<TProps['dimension'], '2d'>
      : TDimension,
    TexelFormatToDataTypeOrNever<
      StorageFormatOptions<TProps> extends TFormat ? TProps['format'] : TFormat
    >
  >;
}

/**
 * Represents what formats a sampled view can choose from based on its owner texture's props.
 */
type SampledFormatOptions<TProps extends TextureProps> =
  | TProps['format']
  | Default<TProps['viewFormats'], []>[number];

export interface SampledTexture<TProps extends TextureProps> {
  usableAsSampledTexture: true;

  asSampled<
    TDimension extends StorageTextureDimension,
    // Limiting the possible choices to the default format
    // of this texture, or to any of the additional view formats.
    // (all limited to what is supported for storage textures)
    TFormat extends SampledFormatOptions<TProps>,
  >(params?: TextureViewParams<TDimension, TFormat>): TgpuSampledTexture;
}

export interface RenderTexture {
  usableAsRenderTexture: true;
}

type LiteralToUsageType<
  T extends 'sampled' | 'storage' | 'render',
  TProps extends TextureProps,
> = T extends 'sampled'
  ? SampledTexture<TProps>
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
  readonly props: TProps; // <- storing to be able to differentiate structurally between different textures.
  readonly label: string | undefined;

  $usage<T extends ('sampled' | 'storage' | 'render')[]>(
    ...usages: T
  ): this & UnionToIntersection<LiteralToUsageType<T[number], TProps>>;

  destroy(): void;
}

export interface TgpuTexture_INTERNAL {
  unwrap(): GPUTexture;
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

export type TextureViewParams<
  TDimension extends GPUTextureViewDimension | undefined,
  TFormat extends GPUTextureFormat | undefined,
> = {
  format?: TFormat;
  dimension?: TDimension;
  aspect?: GPUTextureAspect;
  baseMipLevel?: number;
  mipLevelCount?: number;
  baseArrayLayout?: number;
  arrayLayerCount?: number;
};

export interface TgpuStorageTexture<
  TDimension extends StorageTextureDimension = StorageTextureDimension,
  TData extends TexelData = TexelData,
> {
  dimension: TDimension;
  texelDataType: TData;
  access: StorageTextureAccess;
}

export interface TgpuStorageTexture_INTERNAL {
  unwrap(): GPUTextureView;
}

/**
 * A texture accessed as "readonly" storage on the GPU.
 */
export interface TgpuReadonlyTexture<
  TDimension extends StorageTextureDimension = StorageTextureDimension,
  TData extends TexelData = TexelData,
> extends TgpuStorageTexture<TDimension, TData>,
    TgpuResolvable {
  access: 'readonly';
}

/**
 * A texture accessed as "writeonly" storage on the GPU.
 */
export interface TgpuWriteonlyTexture<
  TDimension extends StorageTextureDimension = StorageTextureDimension,
  TData extends TexelData = TexelData,
> extends TgpuStorageTexture<TDimension, TData>,
    TgpuResolvable {
  access: 'writeonly';
}

/**
 * A texture accessed as "mutable" (or read_write) storage on the GPU.
 */
export interface TgpuMutableTexture<
  TDimension extends StorageTextureDimension = StorageTextureDimension,
  TData extends TexelData = TexelData,
> extends TgpuStorageTexture<TDimension, TData>,
    TgpuResolvable {
  access: 'mutable';
}

/**
 * A texture accessed as sampled on the GPU.
 */
export interface TgpuSampledTexture<
  TDimension extends GPUTextureViewDimension = GPUTextureViewDimension,
  TData extends ChannelData = ChannelData,
> extends TgpuResolvable {
  dimension: TDimension;
  channelDataType: TData;
}

export interface TgpuSampledTexture_INTERNAL {
  unwrap(): GPUTextureView;
}

export function INTERNAL_createTexture(
  props: TextureProps,
  branch: ExperimentalTgpuRoot,
): TgpuTexture<TextureProps> {
  return new TgpuTextureImpl(props, branch);
}

// --------------
// Implementation
// --------------

class TgpuTextureImpl<TProps extends TextureProps>
  implements TgpuTexture<TProps>, TgpuTexture_INTERNAL
{
  public usableAsSampledTexture = false;
  public usableAsStorageTexture = false;
  public usableAsRenderTexture = false;

  private _destroyed = false;
  private _label: string | undefined;
  private _flags = GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC;
  private _texture: GPUTexture | null = null;

  constructor(
    public readonly props: TProps,
    private readonly _branch: ExperimentalTgpuRoot,
  ) {}

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  /**
   * NOTE: Internal use only, use this and you'll get fired. Use `root.unwrap` instead.
   */
  unwrap(): GPUTexture {
    if (this._destroyed) {
      throw new Error('This texture has been destroyed');
    }

    if (!this._texture) {
      this._texture = this._branch.device.createTexture({
        label: this._label ?? '',
        format: this.props.format,
        size: this.props.size,
        usage: this._flags,
        dimension: this.props.dimension ?? '2d',
        viewFormats: this.props.viewFormats ?? [],
        mipLevelCount: this.props.mipLevelCount ?? 1,
        sampleCount: this.props.sampleCount ?? 1,
      });
    }

    return this._texture;
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

  private _asStorage(
    params:
      | TextureViewParams<StorageTextureDimension, StorageTextureTexelFormat>
      | undefined,
    access: StorageTextureAccess,
  ) {
    invariant(this.usableAsStorageTexture, 'Unusable as storage');

    const format = params?.format ?? this.props.format;
    const type = texelFormatToDataType[format as keyof TexelFormatToDataType];
    invariant(!!type, `Unsupported storage texture format: ${format}`);

    return new TgpuBindableStorageTextureImpl(
      params ?? {},
      'readonly',
      this as TgpuTexture<TProps> & TgpuTexture_INTERNAL,
      // biome-ignore lint/suspicious/noExplicitAny: <too much type wrangling>
    ) as any;
  }

  asReadonly(
    params?: TextureViewParams<
      StorageTextureDimension,
      StorageTextureTexelFormat
    >,
  ) {
    return this._asStorage(params, 'readonly');
  }

  asWriteonly(
    params?: TextureViewParams<
      StorageTextureDimension,
      StorageTextureTexelFormat
    >,
  ) {
    return this._asStorage(params, 'writeonly');
  }

  asMutable(
    params?: TextureViewParams<
      StorageTextureDimension,
      StorageTextureTexelFormat
    >,
  ) {
    return this._asStorage(params, 'mutable');
  }

  asSampled(params?: TextureViewParams<GPUTextureDimension, GPUTextureFormat>) {
    invariant(this.usableAsSampledTexture, 'Unusable as sampled');

    const format = params?.format ?? this.props.format;
    // TODO: Implement
  }

  destroy() {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    this._texture?.destroy();
  }
}

const accessToCodeMap = {
  readonly: 'read',
  writeonly: 'write',
  mutable: 'read_write',
};

class TgpuBindableStorageTextureImpl
  implements TgpuStorageTexture, TgpuStorageTexture_INTERNAL
{
  public readonly texelDataType: TexelData;
  public readonly dimension: StorageTextureDimension;

  private _format: StorageTextureTexelFormat;
  private _view: GPUTextureView | undefined;

  constructor(
    props:
      | TextureViewParams<StorageTextureDimension, StorageTextureTexelFormat>
      | undefined,
    public readonly access: StorageTextureAccess,
    private readonly _texture: TgpuTexture<TextureProps> & TgpuTexture_INTERNAL,
  ) {
    this.dimension = props?.dimension ?? _texture.props.dimension ?? '2d';
    this._format =
      props?.format ?? (_texture.props.format as StorageTextureTexelFormat);
    this.texelDataType = texelFormatToDataType[this._format];
  }

  get label(): string | undefined {
    return this._texture.label;
  }

  $name(label: string): this {
    this._texture.$name(label);
    return this;
  }

  unwrap(): GPUTextureView {
    if (!this._view) {
      this._view = this._texture.unwrap().createView({
        label: `${this.label ?? '<unnamed>'} - View`,
        format: this._format,
        dimension: this.dimension,
      });
    }

    return this._view;
  }

  resolve(ctx: ResolutionCtx): string {
    const ident = identifier().$name(this.label);

    ctx.addRenderResource(this, ident);

    return ctx.resolve(ident);
  }
}

class TgpuBindableSampledTextureImpl
  implements TgpuSampledTexture, TgpuSampledTexture_INTERNAL
{
  public readonly channelDataType: ChannelData;
  public readonly dimension: GPUTextureViewDimension;

  private _format: StorageTextureTexelFormat;
  private _view: GPUTextureView | undefined;

  constructor(
    props:
      | TextureViewParams<StorageTextureDimension, StorageTextureTexelFormat>
      | undefined,
    public readonly access: StorageTextureAccess,
    private readonly _texture: TgpuTexture<TextureProps> & TgpuTexture_INTERNAL,
  ) {
    this.dimension = props?.dimension ?? _texture.props.dimension ?? '2d';
    this._format =
      props?.format ?? (_texture.props.format as StorageTextureTexelFormat);
    this.channelDataType = texelFormatToChannelType[this._format];
  }

  get label(): string | undefined {
    return this._texture.label;
  }

  $name(label: string): this {
    this._texture.$name(label);
    return this;
  }

  unwrap(): GPUTextureView {
    if (!this._view) {
      this._view = this._texture.unwrap().createView({
        label: `${this.label ?? '<unnamed>'} - View`,
        format: this._format,
        dimension: this.dimension,
      });
    }

    return this._view;
  }

  resolve(ctx: ResolutionCtx): string {
    const ident = identifier().$name(this.label);

    ctx.addRenderResource(this, ident);

    return ctx.resolve(ident);
  }
}