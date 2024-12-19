import type { F32, I32, U32, Vec4f, Vec4i, Vec4u } from '../../data/wgslTypes';
import { invariant } from '../../errors';
import type { TgpuNamable } from '../../namable';
import type { Default } from '../../shared/utilityTypes';
import type { UnionToIntersection } from '../../shared/utilityTypes';
import type { LayoutMembership } from '../../tgpuBindGroupLayout';
import type { ResolutionCtx, TgpuResolvable } from '../../types';
import type { ExperimentalTgpuRoot } from '../root/rootTypes';
import {
  type SampledFormatOptions,
  type StorageFormatOptions,
  type StorageTextureTexelFormat,
  type TexelFormatToChannelType,
  type TexelFormatToDataType,
  type TexelFormatToDataTypeOrNever,
  channelFormatToSchema,
  channelKindToFormat,
  texelFormatToChannelType,
  texelFormatToDataType,
} from './textureFormats';
import type { TextureProps } from './textureProps';
import type { AllowedUsages, LiteralToExtensionMap } from './usageExtension';

type ResolveStorageDimension<
  TDimension extends GPUTextureViewDimension,
  TProps extends TextureProps,
> = StorageTextureDimension extends TDimension
  ? Default<TProps['dimension'], '2d'>
  : TDimension extends StorageTextureDimension
    ? TDimension
    : '2d';

type ViewUsages<
  TProps extends TextureProps,
  TTexture extends TgpuTexture<TProps>,
> = boolean extends TTexture['usableAsSampled']
  ? TProps['format'] extends StorageTextureTexelFormat
    ? boolean extends TTexture['usableAsStorage']
      ? never
      : 'readonly' | 'writeonly' | 'mutable'
    : never
  : TProps['format'] extends StorageTextureTexelFormat
    ? boolean extends TTexture['usableAsStorage']
      ? 'sampled'
      : 'readonly' | 'writeonly' | 'mutable' | 'sampled'
    : 'sampled';

// ----------
// Public API
// ----------

export type ChannelData = U32 | I32 | F32;
export type TexelData = Vec4u | Vec4i | Vec4f;

/**
 * @param TProps all properties that distinguish this texture apart from other textures on the type level.
 */
export interface TgpuTexture<TProps extends TextureProps = TextureProps>
  extends TgpuNamable {
  readonly resourceType: 'texture';
  readonly props: TProps; // <- storing to be able to differentiate structurally between different textures.
  readonly label: string | undefined;

  // Extensions
  readonly usableAsStorage: boolean;
  readonly usableAsSampled: boolean;
  readonly usableAsRender: boolean;

  $usage<T extends AllowedUsages<TProps>[]>(
    ...usages: T
  ): this & UnionToIntersection<LiteralToExtensionMap[T[number]]>;

  createView<
    TUsage extends ViewUsages<TProps, this>,
    TDimension extends 'sampled' extends TUsage
      ? GPUTextureViewDimension
      : StorageTextureDimension,
    TFormat extends 'sampled' extends TUsage
      ? SampledFormatOptions<TProps>
      : StorageFormatOptions<TProps>,
  >(
    access: TUsage,
    params?: TextureViewParams<TDimension, TFormat>,
  ): {
    mutable: TgpuMutableTexture<
      ResolveStorageDimension<TDimension, TProps>,
      TexelFormatToDataTypeOrNever<
        StorageFormatOptions<TProps> extends TFormat
          ? TProps['format']
          : TFormat
      >
    >;
    readonly: TgpuReadonlyTexture<
      ResolveStorageDimension<TDimension, TProps>,
      TexelFormatToDataTypeOrNever<
        StorageFormatOptions<TProps> extends TFormat
          ? TProps['format']
          : TFormat
      >
    >;
    writeonly: TgpuWriteonlyTexture<
      ResolveStorageDimension<TDimension, TProps>,
      TexelFormatToDataTypeOrNever<
        StorageFormatOptions<TProps> extends TFormat
          ? TProps['format']
          : TFormat
      >
    >;
    sampled: TgpuSampledTexture<
      GPUTextureViewDimension extends TDimension
        ? Default<TProps['dimension'], '2d'>
        : TDimension,
      TexelFormatToChannelType[SampledFormatOptions<TProps> extends TFormat
        ? TProps['format']
        : TFormat]
    >;
  }[TUsage];

  destroy(): void;
}

export interface INTERNAL_TgpuTexture {
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
  // | 'cube-array' <- not supported by storage textures
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
  readonly resourceType: 'texture-storage-view';
  readonly dimension: TDimension;
  readonly texelDataType: TData;
  readonly access: StorageTextureAccess;
}

export interface INTERNAL_TgpuStorageTexture {
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
  readonly access: 'readonly';
}

/**
 * A texture accessed as "writeonly" storage on the GPU.
 */
export interface TgpuWriteonlyTexture<
  TDimension extends StorageTextureDimension = StorageTextureDimension,
  TData extends TexelData = TexelData,
> extends TgpuStorageTexture<TDimension, TData>,
    TgpuResolvable {
  readonly access: 'writeonly';
}

/**
 * A texture accessed as "mutable" (or read_write) storage on the GPU.
 */
export interface TgpuMutableTexture<
  TDimension extends StorageTextureDimension = StorageTextureDimension,
  TData extends TexelData = TexelData,
> extends TgpuStorageTexture<TDimension, TData>,
    TgpuResolvable {
  readonly access: 'mutable';
}

/**
 * A texture accessed as sampled on the GPU.
 */
export interface TgpuSampledTexture<
  TDimension extends GPUTextureViewDimension = GPUTextureViewDimension,
  TData extends ChannelData = ChannelData,
> extends TgpuResolvable {
  readonly resourceType: 'texture-sampled-view';
  readonly dimension: TDimension;
  readonly channelDataType: TData;
}

export interface INTERNAL_TgpuSampledTexture {
  unwrap(): GPUTextureView;
}

export function INTERNAL_createTexture(
  props: TextureProps,
  branch: ExperimentalTgpuRoot,
): TgpuTexture<TextureProps> {
  return new TgpuTextureImpl(
    props,
    branch,
  ) as unknown as TgpuTexture<TextureProps>;
}

export function isTexture<T extends TgpuTexture>(
  value: unknown | T,
): value is T {
  return (value as T)?.resourceType === 'texture';
}

export function isStorageTextureView<
  T extends TgpuReadonlyTexture | TgpuWriteonlyTexture | TgpuMutableTexture,
>(value: unknown | T): value is T {
  return (value as T)?.resourceType === 'texture-storage-view';
}

export function isSampledTextureView<T extends TgpuSampledTexture>(
  value: unknown | T,
): value is T {
  return (value as T)?.resourceType === 'texture-sampled-view';
}

export type TgpuAnyTextureView =
  | TgpuReadonlyTexture
  | TgpuWriteonlyTexture
  | TgpuMutableTexture
  | TgpuSampledTexture;

// --------------
// Implementation
// --------------

const accessMap = {
  mutable: 'read_write',
  readonly: 'read',
  writeonly: 'write',
} as const;

class TgpuTextureImpl<TProps extends TextureProps>
  implements TgpuTexture<TProps>, INTERNAL_TgpuTexture
{
  public readonly resourceType = 'texture';
  public usableAsSampled = false;
  public usableAsStorage = false;
  public usableAsRender = false;

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
        label: this._label ?? '<unnamed>',
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
  ): this & UnionToIntersection<LiteralToExtensionMap[T[number]]> {
    const hasStorage = usages.includes('storage');
    const hasSampled = usages.includes('sampled');
    const hasRender = usages.includes('render');
    this._flags |= hasSampled ? GPUTextureUsage.TEXTURE_BINDING : 0;
    this._flags |= hasStorage ? GPUTextureUsage.STORAGE_BINDING : 0;
    this._flags |= hasRender ? GPUTextureUsage.RENDER_ATTACHMENT : 0;
    this.usableAsStorage ||= hasStorage;
    this.usableAsSampled ||= hasSampled;
    this.usableAsRender ||= hasRender;

    return this as this & UnionToIntersection<LiteralToExtensionMap[T[number]]>;
  }

  private _asStorage(
    params:
      | TextureViewParams<StorageTextureDimension, StorageTextureTexelFormat>
      | undefined,
    access: StorageTextureAccess,
  ): TgpuFixedStorageTextureImpl<TProps> {
    if (!this.usableAsStorage) {
      throw new Error('Unusable as storage');
    }

    const format = params?.format ?? this.props.format;
    const type = texelFormatToDataType[format as keyof TexelFormatToDataType];
    invariant(!!type, `Unsupported storage texture format: ${format}`);

    return new TgpuFixedStorageTextureImpl(params ?? {}, access, this);
  }

  createView(
    access: 'mutable' | 'readonly' | 'writeonly' | 'sampled',
    params?: TextureViewParams<GPUTextureViewDimension, GPUTextureFormat>,
  ) {
    if (access === 'sampled') {
      return this.asSampled(params);
    }

    const storageParams = params as TextureViewParams<
      StorageTextureDimension,
      StorageTextureTexelFormat
    >;

    switch (access) {
      case 'mutable':
        return this.asMutable(storageParams);
      case 'readonly':
        return this.asReadonly(storageParams);
      case 'writeonly':
        return this.asWriteonly(storageParams);
    }
  }

  asReadonly(
    params?: TextureViewParams<
      StorageTextureDimension,
      StorageTextureTexelFormat
    >,
  ) {
    // biome-ignore lint/suspicious/noExplicitAny: <too much type wrangling>
    return this._asStorage(params, 'readonly') as any;
  }

  asWriteonly(
    params?: TextureViewParams<
      StorageTextureDimension,
      StorageTextureTexelFormat
    >,
  ) {
    // biome-ignore lint/suspicious/noExplicitAny: <too much type wrangling>
    return this._asStorage(params, 'writeonly') as any;
  }

  asMutable(
    params?: TextureViewParams<
      StorageTextureDimension,
      StorageTextureTexelFormat
    >,
  ) {
    // biome-ignore lint/suspicious/noExplicitAny: <too much type wrangling>
    return this._asStorage(params, 'mutable') as any;
  }

  asSampled(
    params?: TextureViewParams<GPUTextureViewDimension, GPUTextureFormat>,
    // biome-ignore lint/suspicious/noExplicitAny: <too much type wrangling>
  ): any {
    if (!this.usableAsSampled) {
      throw new Error('Unusable as sampled');
    }

    const format = params?.format ?? this.props.format;
    const type = texelFormatToDataType[format as keyof TexelFormatToDataType];

    if (!type) {
      throw new Error(`Unsupported storage texture format: ${format}`);
    }

    return new TgpuFixedSampledTextureImpl(params, this);
  }

  destroy() {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    this._texture?.destroy();
  }
}

const dimensionToCodeMap = {
  '1d': '1d',
  '2d': '2d',
  '2d-array': '2d_array',
  cube: 'cube',
  'cube-array': 'cube_array',
  '3d': '3d',
} satisfies Record<GPUTextureViewDimension, string>;

class TgpuFixedStorageTextureImpl<TProps extends TextureProps>
  implements TgpuStorageTexture, INTERNAL_TgpuStorageTexture, TgpuNamable
{
  public readonly resourceType = 'texture-storage-view';
  public readonly texelDataType: TexelData;
  public readonly dimension: StorageTextureDimension;

  private _view: GPUTextureView | undefined;
  private readonly _format: StorageTextureTexelFormat;

  constructor(
    props:
      | TextureViewParams<StorageTextureDimension, StorageTextureTexelFormat>
      | undefined,
    public readonly access: StorageTextureAccess,
    private readonly _texture: TgpuTexture<TProps> & INTERNAL_TgpuTexture,
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
    const id = ctx.names.makeUnique(this.label);
    const { group, binding } = ctx.allocateFixedEntry(
      {
        storageTexture: this._format,
        access: this.access,
        viewDimension: this.dimension,
      },
      this,
    );
    const type = `texture_storage_${dimensionToCodeMap[this.dimension]}`;

    ctx.addDeclaration(
      `@group(${group}) @binding(${binding}) var ${id}: ${type}<${this._format}, ${
        accessMap[this.access]
      }>;`,
    );

    return id;
  }
}

export class TgpuLaidOutStorageTextureImpl implements TgpuStorageTexture {
  public readonly resourceType = 'texture-storage-view';
  public readonly texelDataType: TexelData;

  constructor(
    private readonly _format: StorageTextureTexelFormat,
    public readonly dimension: StorageTextureDimension,
    public readonly access: StorageTextureAccess,
    private readonly _membership: LayoutMembership,
  ) {
    this.texelDataType = texelFormatToDataType[this._format];
  }

  get label(): string | undefined {
    return this._membership.key;
  }

  resolve(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this.label);
    const group = ctx.allocateLayoutEntry(this._membership.layout);
    const type = `texture_storage_${dimensionToCodeMap[this.dimension]}`;

    ctx.addDeclaration(
      `@group(${group}) @binding(${this._membership.idx}) var ${id}: ${type}<${this._format}, ${accessMap[this.access]}>;`,
    );

    return id;
  }
}

class TgpuFixedSampledTextureImpl<TProps extends TextureProps>
  implements TgpuSampledTexture, INTERNAL_TgpuSampledTexture, TgpuNamable
{
  public readonly resourceType = 'texture-sampled-view';
  public readonly channelDataType: ChannelData;
  public readonly dimension: GPUTextureViewDimension;

  private _format: GPUTextureFormat;
  private _view: GPUTextureView | undefined;

  constructor(
    private readonly _props:
      | TextureViewParams<GPUTextureViewDimension, GPUTextureFormat>
      | undefined,
    private readonly _texture: TgpuTexture<TProps> & INTERNAL_TgpuTexture,
  ) {
    this.dimension = _props?.dimension ?? _texture.props.dimension ?? '2d';
    this._format =
      _props?.format ?? (_texture.props.format as GPUTextureFormat);
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
        ...this._props,
      });
    }

    return this._view;
  }

  resolve(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this.label);

    const multisampled = (this._texture.props.sampleCount ?? 1) > 1;
    const { group, binding } = ctx.allocateFixedEntry(
      {
        texture: channelKindToFormat[this.channelDataType.type],
        viewDimension: this.dimension,
        multisampled,
      },
      this,
    );

    const type = multisampled
      ? 'texture_multisampled_2d'
      : `texture_${dimensionToCodeMap[this.dimension]}`;

    ctx.addDeclaration(
      `@group(${group}) @binding(${binding}) var ${id}: ${type}<${ctx.resolve(this.channelDataType)}>;`,
    );

    return id;
  }
}

export class TgpuLaidOutSampledTextureImpl implements TgpuSampledTexture {
  public readonly resourceType = 'texture-sampled-view';
  public readonly channelDataType: ChannelData;

  constructor(
    sampleType: GPUTextureSampleType,
    public readonly dimension: GPUTextureViewDimension,
    private readonly _multisampled: boolean,
    private readonly _membership: LayoutMembership,
  ) {
    this.channelDataType = channelFormatToSchema[sampleType];
  }

  get label(): string | undefined {
    return this._membership.key;
  }

  resolve(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this.label);
    const group = ctx.allocateLayoutEntry(this._membership.layout);

    const type = this._multisampled
      ? 'texture_multisampled_2d'
      : `texture_${dimensionToCodeMap[this.dimension]}`;

    ctx.addDeclaration(
      `@group(${group}) @binding(${this._membership.idx}) var ${id}: ${type}<${ctx.resolve(this.channelDataType)}>;`,
    );

    return id;
  }
}
