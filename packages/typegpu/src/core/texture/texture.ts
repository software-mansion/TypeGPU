import type { AnyData } from '../../data/dataTypes.ts';
import type {
  F32,
  I32,
  U32,
  Vec4f,
  Vec4i,
  Vec4u,
} from '../../data/wgslTypes.ts';
import { invariant } from '../../errors.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import {
  $getNameForward,
  $internal,
  $wgslDataType,
} from '../../shared/symbols.ts';
import type {
  Default,
  UnionToIntersection,
} from '../../shared/utilityTypes.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import {
  channelFormatToSchema,
  channelKindToFormat,
  type SampledFormatOptions,
  type StorageFormatOptions,
  type StorageTextureTexelFormat,
  type TexelFormatToChannelType,
  texelFormatToChannelType,
  type TexelFormatToDataType,
  texelFormatToDataType,
  type TexelFormatToDataTypeOrNever,
} from './textureFormats.ts';
import type { TextureProps } from './textureProps.ts';
import type { AllowedUsages, LiteralToExtensionMap } from './usageExtension.ts';

type ResolveStorageDimension<
  TDimension extends GPUTextureViewDimension,
  TProps extends TextureProps,
> = StorageTextureDimension extends TDimension
  ? Default<TProps['dimension'], '2d'>
  : TDimension extends StorageTextureDimension ? TDimension
  : '2d';

type ViewUsages<
  TProps extends TextureProps,
  TTexture extends TgpuTexture<TProps>,
> = boolean extends TTexture['usableAsSampled']
  ? boolean extends TTexture['usableAsStorage'] ? never
  : 'readonly' | 'writeonly' | 'mutable'
  : boolean extends TTexture['usableAsStorage'] ? 'sampled'
  : 'readonly' | 'writeonly' | 'mutable' | 'sampled';

interface TextureInternals {
  unwrap(): GPUTexture;
}

interface TextureViewInternals {
  readonly unwrap?: (() => GPUTextureView) | undefined;
}

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
  readonly [$internal]: TextureInternals;
  readonly resourceType: 'texture';
  readonly props: TProps; // <- storing to be able to differentiate structurally between different textures.

  // Extensions
  readonly usableAsStorage: boolean;
  readonly usableAsSampled: boolean;
  readonly usableAsRender: boolean;

  $usage<T extends AllowedUsages<TProps>[]>(
    ...usages: T
  ): this & UnionToIntersection<LiteralToExtensionMap[T[number]]>;

  createView<
    TUsage extends ViewUsages<TProps, this>,
    TDimension extends 'sampled' extends TUsage ? GPUTextureViewDimension
      : StorageTextureDimension,
    TFormat extends 'sampled' extends TUsage ? SampledFormatOptions<TProps>
      : StorageFormatOptions<TProps>,
  >(
    access: TUsage,
    params?: TextureViewParams<TDimension, TFormat>,
  ): {
    mutable: TgpuMutableTexture<
      ResolveStorageDimension<TDimension, TProps>,
      TexelFormatToDataTypeOrNever<
        StorageFormatOptions<TProps> extends TFormat ? TProps['format']
          : TFormat
      >
    >;
    readonly: TgpuReadonlyTexture<
      ResolveStorageDimension<TDimension, TProps>,
      TexelFormatToDataTypeOrNever<
        StorageFormatOptions<TProps> extends TFormat ? TProps['format']
          : TFormat
      >
    >;
    writeonly: TgpuWriteonlyTexture<
      ResolveStorageDimension<TDimension, TProps>,
      TexelFormatToDataTypeOrNever<
        StorageFormatOptions<TProps> extends TFormat ? TProps['format']
          : TFormat
      >
    >;
    sampled: TgpuSampledTexture<
      GPUTextureViewDimension extends TDimension
        ? Default<TProps['dimension'], '2d'>
        : TDimension,
      TexelFormatToChannelType[
        SampledFormatOptions<TProps> extends TFormat ? TProps['format']
          : TFormat
      ]
    >;
  }[TUsage];

  destroy(): void;
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
  readonly [$internal]: TextureViewInternals;
  readonly resourceType: 'texture-storage-view';
  readonly dimension: TDimension;
  readonly texelDataType: TData;
  readonly access: StorageTextureAccess;
}

/**
 * A texture accessed as "readonly" storage on the GPU.
 */
export interface TgpuReadonlyTexture<
  TDimension extends StorageTextureDimension = StorageTextureDimension,
  TData extends TexelData = TexelData,
> extends TgpuStorageTexture<TDimension, TData> {
  readonly access: 'readonly';
}

/**
 * A texture accessed as "writeonly" storage on the GPU.
 */
export interface TgpuWriteonlyTexture<
  TDimension extends StorageTextureDimension = StorageTextureDimension,
  TData extends TexelData = TexelData,
> extends TgpuStorageTexture<TDimension, TData> {
  readonly access: 'writeonly';
}

/**
 * A texture accessed as "mutable" (or read_write) storage on the GPU.
 */
export interface TgpuMutableTexture<
  TDimension extends StorageTextureDimension = StorageTextureDimension,
  TData extends TexelData = TexelData,
> extends TgpuStorageTexture<TDimension, TData> {
  readonly access: 'mutable';
}

/**
 * A texture accessed as sampled on the GPU.
 */
export interface TgpuSampledTexture<
  TDimension extends GPUTextureViewDimension = GPUTextureViewDimension,
  TData extends ChannelData = ChannelData,
> {
  readonly [$internal]: TextureViewInternals;
  readonly resourceType: 'texture-sampled-view';
  readonly dimension: TDimension;
  readonly channelDataType: TData;
}

export function INTERNAL_createTexture(
  props: TextureProps,
  branch: ExperimentalTgpuRoot,
): TgpuTexture<TextureProps> {
  return new TgpuTextureImpl(props, branch);
}

export function isTexture<T extends TgpuTexture>(
  value: unknown | T,
): value is T {
  return (value as T)?.resourceType === 'texture' && !!(value as T)[$internal];
}

export function isStorageTextureView<
  T extends TgpuReadonlyTexture | TgpuWriteonlyTexture | TgpuMutableTexture,
>(value: unknown | T): value is T {
  return (
    (value as T)?.resourceType === 'texture-storage-view' &&
    !!(value as T)[$internal]
  );
}

export function isSampledTextureView<T extends TgpuSampledTexture>(
  value: unknown | T,
): value is T {
  return (
    (value as T)?.resourceType === 'texture-sampled-view' &&
    !!(value as T)[$internal]
  );
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

class TgpuTextureImpl implements TgpuTexture {
  public readonly [$internal]: TextureInternals;
  public readonly resourceType = 'texture';
  public usableAsSampled = false;
  public usableAsStorage = false;
  public usableAsRender = false;

  private _destroyed = false;
  private _flags = GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC;
  private _texture: GPUTexture | null = null;

  constructor(
    public readonly props: TextureProps,
    private readonly _branch: ExperimentalTgpuRoot,
  ) {
    this[$internal] = {
      unwrap: () => {
        if (this._destroyed) {
          throw new Error('This texture has been destroyed');
        }

        if (!this._texture) {
          this._texture = this._branch.device.createTexture({
            label: getName(this) ?? '<unnamed>',
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
      },
    };
  }

  $name(label: string) {
    setName(this, label);
    return this;
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

  createView(
    access: 'mutable' | 'readonly' | 'writeonly' | 'sampled',
    params?: TextureViewParams<GPUTextureViewDimension, GPUTextureFormat>,
  ) {
    if (access === 'sampled') {
      return this._asSampled(params);
    }

    const storageParams = params as TextureViewParams<
      StorageTextureDimension,
      StorageTextureTexelFormat
    >;

    switch (access) {
      case 'mutable':
        return this._asMutable(storageParams);
      case 'readonly':
        return this._asReadonly(storageParams);
      case 'writeonly':
        return this._asWriteonly(storageParams);
    }
  }

  private _asStorage(
    params:
      | TextureViewParams<StorageTextureDimension, StorageTextureTexelFormat>
      | undefined,
    access: StorageTextureAccess,
  ): TgpuFixedStorageTextureImpl {
    if (!this.usableAsStorage) {
      throw new Error('Unusable as storage');
    }

    const format = params?.format ?? this.props.format;
    const type = texelFormatToDataType[format as keyof TexelFormatToDataType];
    invariant(!!type, `Unsupported storage texture format: ${format}`);

    return new TgpuFixedStorageTextureImpl(params ?? {}, access, this);
  }

  private _asReadonly(
    params?: TextureViewParams<
      StorageTextureDimension,
      StorageTextureTexelFormat
    >,
  ) {
    // biome-ignore lint/suspicious/noExplicitAny: <too much type wrangling>
    return this._asStorage(params, 'readonly') as any;
  }

  private _asWriteonly(
    params?: TextureViewParams<
      StorageTextureDimension,
      StorageTextureTexelFormat
    >,
  ) {
    // biome-ignore lint/suspicious/noExplicitAny: <too much type wrangling>
    return this._asStorage(params, 'writeonly') as any;
  }

  private _asMutable(
    params?: TextureViewParams<
      StorageTextureDimension,
      StorageTextureTexelFormat
    >,
  ) {
    // biome-ignore lint/suspicious/noExplicitAny: <too much type wrangling>
    return this._asStorage(params, 'mutable') as any;
  }

  private _asSampled(
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

class TgpuFixedStorageTextureImpl
  implements TgpuStorageTexture, SelfResolvable, TgpuNamable {
  public readonly [$wgslDataType]: AnyData;
  public readonly [$internal]: TextureViewInternals;
  public readonly [$getNameForward]: TgpuTexture<TextureProps>;
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
    private readonly _texture: TgpuTexture,
  ) {
    // TODO: do not treat self-resolvable as wgsl data (when we have proper texture schemas)
    // biome-ignore lint/suspicious/noExplicitAny: This is necessary until we have texture schemas
    this[$wgslDataType] = this as any;
    this[$internal] = {
      unwrap: () => {
        if (!this._view) {
          this._view = this._texture[$internal].unwrap().createView({
            label: `${getName(this) ?? '<unnamed>'} - View`,
            format: this._format,
            dimension: this.dimension,
          });
        }

        return this._view;
      },
    };
    this[$getNameForward] = _texture;

    this.dimension = props?.dimension ?? _texture.props.dimension ?? '2d';
    this._format = props?.format ??
      (_texture.props.format as StorageTextureTexelFormat);
    this.texelDataType = texelFormatToDataType[this._format];
  }

  $name(label: string): this {
    this._texture.$name(label);
    return this;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));
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

  toString() {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
  }
}

export class TgpuLaidOutStorageTextureImpl
  implements TgpuStorageTexture, SelfResolvable {
  public readonly [$wgslDataType]: AnyData;
  public readonly [$internal]: TextureViewInternals;
  public readonly resourceType = 'texture-storage-view';
  public readonly texelDataType: TexelData;

  constructor(
    private readonly _format: StorageTextureTexelFormat,
    public readonly dimension: StorageTextureDimension,
    public readonly access: StorageTextureAccess,
    private readonly _membership: LayoutMembership,
  ) {
    // TODO: do not treat self-resolvable as wgsl data (when we have proper texture schemas)
    // biome-ignore lint/suspicious/noExplicitAny: This is necessary until we have texture schemas
    this[$wgslDataType] = this as any;
    this[$internal] = {};
    this.texelDataType = texelFormatToDataType[this._format];
    setName(this, _membership.key);
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));
    const group = ctx.allocateLayoutEntry(this._membership.layout);
    const type = `texture_storage_${dimensionToCodeMap[this.dimension]}`;

    ctx.addDeclaration(
      `@group(${group}) @binding(${this._membership.idx}) var ${id}: ${type}<${this._format}, ${
        accessMap[this.access]
      }>;`,
    );

    return id;
  }

  toString() {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
  }
}

class TgpuFixedSampledTextureImpl
  implements TgpuSampledTexture, SelfResolvable, TgpuNamable {
  public readonly [$wgslDataType]: AnyData;
  public readonly [$internal]: TextureViewInternals;
  public readonly [$getNameForward]: TgpuTexture<TextureProps>;
  public readonly resourceType = 'texture-sampled-view';
  public readonly channelDataType: ChannelData;
  public readonly dimension: GPUTextureViewDimension;

  private _format: GPUTextureFormat;
  private _view: GPUTextureView | undefined;

  constructor(
    private readonly _props:
      | TextureViewParams<GPUTextureViewDimension, GPUTextureFormat>
      | undefined,
    private readonly _texture: TgpuTexture,
  ) {
    // TODO: do not treat self-resolvable as wgsl data (when we have proper texture schemas)
    // biome-ignore lint/suspicious/noExplicitAny: This is necessary until we have texture schemas
    this[$wgslDataType] = this as any;
    this[$internal] = {
      unwrap: () => {
        if (!this._view) {
          this._view = this._texture[$internal].unwrap().createView({
            label: `${getName(this) ?? '<unnamed>'} - View`,
            ...this._props,
          });
        }

        return this._view;
      },
    };
    this[$getNameForward] = _texture;
    this.dimension = _props?.dimension ?? _texture.props.dimension ?? '2d';
    this._format = _props?.format ??
      (_texture.props.format as GPUTextureFormat);
    this.channelDataType = texelFormatToChannelType[this._format];
  }

  $name(label: string): this {
    this._texture.$name(label);
    return this;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));

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
      `@group(${group}) @binding(${binding}) var ${id}: ${type}<${
        ctx.resolve(this.channelDataType)
      }>;`,
    );

    return id;
  }

  toString() {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
  }
}

export class TgpuLaidOutSampledTextureImpl
  implements TgpuSampledTexture, SelfResolvable {
  public readonly [$wgslDataType]: AnyData;
  public readonly [$internal]: TextureViewInternals;
  public readonly resourceType = 'texture-sampled-view';
  public readonly channelDataType: ChannelData;

  constructor(
    sampleType: GPUTextureSampleType,
    public readonly dimension: GPUTextureViewDimension,
    private readonly _multisampled: boolean,
    private readonly _membership: LayoutMembership,
  ) {
    // TODO: do not treat self-resolvable as wgsl data (when we have proper texture schemas)
    // biome-ignore lint/suspicious/noExplicitAny: This is necessary until we have texture schemas
    this[$wgslDataType] = this as any;
    this[$internal] = {};
    setName(this, _membership.key);
    this.channelDataType = channelFormatToSchema[sampleType];
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));
    const group = ctx.allocateLayoutEntry(this._membership.layout);

    const type = this._multisampled
      ? 'texture_multisampled_2d'
      : `texture_${dimensionToCodeMap[this.dimension]}`;

    ctx.addDeclaration(
      `@group(${group}) @binding(${this._membership.idx}) var ${id}: ${type}<${
        ctx.resolve(this.channelDataType)
      }>;`,
    );

    return id;
  }

  toString() {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
  }
}
