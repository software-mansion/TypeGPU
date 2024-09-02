import { vec4f, vec4i, vec4u } from './data';
import type {
  AnyTgpuPrimitive,
  AnyTgpuTexelFormat,
  ResolutionCtx,
  SampledTextureParams,
  StorageTextureAccess,
  StorageTextureParams,
  TextureUsage,
  TgpuNamable,
  TgpuRenderResource,
  TgpuRenderResourceType,
} from './types';
import { TgpuIdentifier } from './wgslIdentifier';
import { isSampler } from './wgslSampler';

export interface TgpuAnyTextureView extends TgpuRenderResource {
  readonly descriptor: GPUTextureViewDescriptor;
  readonly texture: TgpuAnyTexture;
  readonly dataType: AnyTgpuPrimitive | AnyTgpuTexelFormat;
  readonly access: StorageTextureAccess | undefined;
}

export interface TgpuAnyTexture {
  readonly descriptor: Omit<GPUTextureDescriptor, 'usage'>;
  get flags(): GPUTextureUsageFlags;
}

export interface TgpuTexture<TAllows extends TextureUsage = never>
  extends TgpuNamable {
  readonly descriptor: Omit<GPUTextureDescriptor, 'usage'>;
  get label(): string | undefined;
  get flags(): GPUTextureUsageFlags;

  $allowSampled(): TgpuTexture<TAllows | 'sampled'>;
  $allowStorage(): TgpuTexture<TAllows | 'storage'>;

  asStorage(
    params: StorageTextureParams,
  ): 'storage' extends TAllows
    ? TgpuTextureView<AnyTgpuTexelFormat, 'storage'>
    : null;
  asSampled(
    params: SampledTextureParams,
  ): 'sampled' extends TAllows
    ? TgpuTextureView<typeof params.dataType, 'sampled'>
    : null;
}

export interface TgpuTextureView<
  TData extends AnyTgpuPrimitive | AnyTgpuTexelFormat,
  TUsage extends TextureUsage,
> extends TgpuRenderResource,
    TgpuNamable {
  readonly texture: TgpuTexture<TUsage>;
  readonly descriptor: Omit<GPUTextureViewDescriptor, 'usage'>;
  readonly type: TgpuRenderResourceType;
  readonly dataType: TData;
  readonly access: StorageTextureAccess | undefined;
}

export interface TgpuTextureExternal extends TgpuRenderResource {
  readonly descriptor: GPUExternalTextureDescriptor;
}

export function texture<TUsage extends TextureUsage = never>(
  descriptor: Omit<GPUTextureDescriptor, 'usage'>,
): TgpuTexture<TUsage> {
  return new TgpuTextureImpl(descriptor);
}

export function textureExternal(descriptor: GPUExternalTextureDescriptor) {
  return new TgpuTextureExternalImpl(descriptor);
}

class TgpuTextureImpl<TAllows extends TextureUsage = never>
  implements TgpuTexture<TAllows>, TgpuAnyTexture
{
  private _flags: GPUTextureUsageFlags =
    GPUTextureUsage.COPY_DST |
    GPUTextureUsage.COPY_SRC |
    GPUTextureUsage.RENDER_ATTACHMENT;
  private _allowedUsages: {
    sampled: Map<string, TgpuTextureView<AnyTgpuPrimitive, 'sampled'>> | null;
    storage: Map<string, TgpuTextureView<AnyTgpuTexelFormat, 'storage'>> | null;
  } = {
    sampled: null,
    storage: null,
  };
  private _label: string | undefined;

  constructor(
    public readonly descriptor: Omit<GPUTextureDescriptor, 'usage'>,
  ) {}

  get label() {
    return this._label;
  }

  get flags() {
    return this._flags;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  $addFlags(flags: GPUTextureUsageFlags) {
    this._flags |= flags;
    return this;
  }

  $allowSampled() {
    const enrichedThis = this as TgpuTexture<TAllows | 'sampled'>;
    if (!this._allowedUsages.sampled) {
      this._allowedUsages.sampled = new Map();
    }
    this.$addFlags(GPUTextureUsage.TEXTURE_BINDING);
    return enrichedThis;
  }

  $allowStorage() {
    const enrichedThis = this as TgpuTexture<TAllows | 'storage'>;
    if (!this._allowedUsages.storage) {
      this._allowedUsages.storage = new Map();
    }
    this.$addFlags(GPUTextureUsage.STORAGE_BINDING);
    return enrichedThis;
  }

  private getStorageIfAllowed(
    params: StorageTextureParams,
  ): TgpuTextureView<AnyTgpuTexelFormat, 'storage'> | null {
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
  ): TgpuTextureView<AnyTgpuPrimitive, 'sampled'> | null {
    if (!this._allowedUsages.sampled) {
      return null;
    }
    const stringified = hashFromShallowObj(params);
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

class TgpuTextureViewImpl<
  TData extends AnyTgpuPrimitive | AnyTgpuTexelFormat,
  TUsage extends TextureUsage,
> implements TgpuTextureView<TData, TUsage>, TgpuAnyTextureView
{
  private _label: string | undefined;

  constructor(
    public readonly type: TgpuRenderResourceType,
    public readonly texture: TgpuTexture<TUsage>,
    public readonly dataType: TData,
    public readonly descriptor: GPUTextureViewDescriptor = {},
    public readonly access: StorageTextureAccess | undefined = undefined,
  ) {}

  get label() {
    return this._label;
  }

  $name(label: string | undefined) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new TgpuIdentifier().$name(this._label);

    ctx.addRenderResource(this, identifier);

    return ctx.resolve(identifier);
  }
}

class TgpuTextureExternalImpl implements TgpuTextureExternal {
  private _label: string | undefined;
  public readonly type = 'texture_external';

  constructor(public readonly descriptor: GPUExternalTextureDescriptor) {}

  get label() {
    return this._label;
  }

  $name(label: string | undefined) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new TgpuIdentifier().$name(this._label);

    ctx.addRenderResource(this, identifier);

    return ctx.resolve(identifier);
  }
}

export function isExternalTexture(
  texture: TgpuRenderResource,
): texture is TgpuTextureExternal {
  return !('texture' in texture) && !isSampler(texture);
}

export function isTextureView(
  texture: TgpuRenderResource,
): texture is TgpuAnyTextureView {
  return 'texture' in texture;
}

const texelFormatToTgpuType: Record<string, AnyTgpuTexelFormat> = {
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
};

function hashFromShallowObj(obj: object): string {
  const withKeysSorted = Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
  );

  return JSON.stringify(withKeysSorted);
}
