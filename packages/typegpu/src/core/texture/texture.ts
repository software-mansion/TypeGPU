import type { F32, I32, U32 } from '../../data';
import {
  type Vec4f,
  type Vec4i,
  type Vec4u,
  vec4f,
  vec4i,
  vec4u,
} from '../../data/vector';
import { invariant } from '../../errors';
import type { TgpuNamable } from '../../namable';
import { identifier } from '../../tgpuIdentifier';
import type { ResolutionCtx, TgpuResolvable } from '../../types';
import type { Default } from '../../utilityTypes';
import type { UnionToIntersection } from '../../utilityTypes';
import type { ExperimentalTgpuRoot } from '../root/rootTypes';
import type { SampledTextureParams } from './textureTypes';

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
  size: number[];
  format: GPUTextureFormat;
  viewFormats?: GPUTextureFormat[] | undefined;
  dimension?: GPUTextureDimension | undefined;
  mipLevelCount?: number | undefined;
  sampleCount?: number | undefined;
};

export interface StorageTexture<TProps extends TextureProps> {
  usableAsStorageTexture: true;

  asReadonly<
    TDimension extends StorageTextureDimension,
    // Limiting the possible choices to the default format
    // of this texture, or to any of the additional view formats.
    // (all limited to what is supported for storage textures)
    TFormat extends Extract<
      TProps['format'] | Default<TProps['viewFormats'], []>[number],
      StorageTextureTexelFormat
    >,
  >(
    params?: TextureViewParams<TDimension, TFormat>,
  ): TgpuReadonlyTexture<
    StorageTextureDimension extends TDimension
      ? Default<TProps['dimension'], '2d'>
      : TDimension,
    TexelFormatToDataTypeOrNever<Default<TFormat, TProps['format']>>
  >;
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
  texelDataType: TData;
  dimension: TDimension;
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
type TexelFormatToDataTypeOrNever<T> = T extends keyof TexelFormatToDataType
  ? TexelFormatToDataType[T]
  : never;

export function INTERNAL_createTexture<TProps extends TextureProps>(
  props: TProps,
  branch: ExperimentalTgpuRoot,
): TgpuTexture<TProps> {
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

  asReadonly<
    TDimension extends StorageTextureDimension,
    // Limiting the possible choices to the default format
    // of this texture, or to any of the additional view formats.
    // (all limited to what is supported for storage textures)
    TFormat extends Extract<
      TProps['format'] | Default<TProps['viewFormats'], []>[number],
      StorageTextureTexelFormat
    >,
  >(
    params: TextureViewParams<TDimension, TFormat>,
  ): TgpuReadonlyTexture<
    StorageTextureDimension extends TDimension
      ? Default<TProps['dimension'], '2d'>
      : TDimension,
    TexelFormatToDataType[TFormat]
  > {
    invariant(
      this.usableAsStorageTexture,
      "asReadonly is only available when explicitly marked with `.$usage('storage')",
    );

    const format = params.format ?? this.props.format;

    const type = texelFormatToTgpuType[format as keyof TexelFormatToDataType];
    invariant(
      !!type,
      `Cannot create a storage view for the given texture format: ${format}`,
    );

    // biome-ignore lint/suspicious/noExplicitAny: <too much type wrangling>
    return new TgpuBindableStorageTextureImpl(params, 'readonly', this) as any;
  }

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

class TgpuBindableStorageTextureImpl<
  TDimension extends StorageTextureDimension = StorageTextureDimension,
  TFormat extends StorageTextureTexelFormat = StorageTextureTexelFormat,
> implements
    TgpuStorageTexture<TDimension, TexelFormatToDataType[TFormat]>,
    TgpuStorageTexture_INTERNAL
{
  public readonly texelDataType: TexelFormatToDataType[TFormat];
  public readonly dimension: TDimension;

  private _format: TFormat;
  private _view: GPUTextureView | undefined;

  constructor(
    props: TextureViewParams<TDimension, TFormat>,
    public readonly access: StorageTextureAccess,
    private readonly _texture: TgpuTextureImpl<TextureProps>,
  ) {
    this.dimension = (props.dimension ??
      _texture.props.dimension ??
      '2d') as TDimension;
    this._format = props.format ?? (_texture.props.format as TFormat);
    this.texelDataType = texelFormatToTgpuType[
      this._format
    ] as TexelFormatToDataType[TFormat];
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
