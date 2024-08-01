import { vec4f, vec4i, vec4u } from './data';
import type {
  AnyWgslPrimitive,
  AnyWgslTexelFormat,
  ResolutionCtx,
  SampledTextureParams,
  StorageTextureAccess,
  StorageTextureParams,
  TextureUsage,
  WgslExternalTextureType,
  WgslRenderResource,
  WgslRenderResourceType,
} from './types';
import { WgslIdentifier } from './wgslIdentifier';
import { isSampler } from './wgslSampler';

export interface WgslAnyTextureView {
  readonly descriptor: GPUTextureViewDescriptor;
  readonly texture: WgslAnyTexture;
  readonly access: StorageTextureAccess | undefined;
}

export interface WgslAnyTexture {
  readonly descriptor: Omit<GPUTextureDescriptor, 'usage'>;
  get flags(): GPUTextureUsageFlags;
}

export interface WgslTexture<TAllows extends TextureUsage = never> {
  readonly descriptor: Omit<GPUTextureDescriptor, 'usage'>;
  get label(): string | undefined;
  get flags(): GPUTextureUsageFlags;

  $name(label: string): WgslTexture<TAllows>;
  $allowSampled(): WgslTexture<TAllows | 'sampled'>;
  $allowStorage(): WgslTexture<TAllows | 'storage'>;

  asStorage(
    params: StorageTextureParams,
  ): 'storage' extends TAllows
    ? WgslTextureView<AnyWgslTexelFormat, 'storage'>
    : null;
  asSampled(
    params: SampledTextureParams,
  ): 'sampled' extends TAllows
    ? WgslTextureView<typeof params.dataType, 'sampled'>
    : null;
}

export interface WgslTextureView<
  TData extends AnyWgslPrimitive | AnyWgslTexelFormat,
  TUsage extends TextureUsage,
> extends WgslRenderResource<WgslRenderResourceType> {
  readonly texture: WgslTexture<TUsage>;
  readonly descriptor: Omit<GPUTextureViewDescriptor, 'usage'>;
  readonly type: WgslRenderResourceType;
  readonly dataType: TData;
  readonly access: StorageTextureAccess | undefined;
}

export interface WgslTextureExternal
  extends WgslRenderResource<WgslExternalTextureType> {
  readonly descriptor: GPUExternalTextureDescriptor;
}

export function texture<TUsage extends TextureUsage = never>(
  descriptor: Omit<GPUTextureDescriptor, 'usage'>,
): WgslTexture<TUsage> {
  return new WgslTextureImpl(descriptor);
}

export function textureExternal(descriptor: GPUExternalTextureDescriptor) {
  return new WgslTextureExternalImpl(descriptor);
}

class WgslTextureImpl<TAllows extends TextureUsage = never>
  implements WgslTexture<TAllows>, WgslAnyTexture
{
  private _flags: GPUTextureUsageFlags =
    GPUTextureUsage.COPY_DST |
    GPUTextureUsage.COPY_SRC |
    GPUTextureUsage.RENDER_ATTACHMENT;
  private _allowedUsages: {
    sampled: WeakMap<
      SampledTextureParams,
      WgslTextureView<AnyWgslPrimitive, 'sampled'>
    > | null;
    storage: WeakMap<
      StorageTextureParams,
      WgslTextureView<AnyWgslTexelFormat, 'storage'>
    > | null;
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
    const enrichedThis = this as WgslTexture<TAllows | 'sampled'>;
    if (!this._allowedUsages.sampled) {
      this._allowedUsages.sampled = new WeakMap();
    }
    this.$addFlags(GPUTextureUsage.TEXTURE_BINDING);
    return enrichedThis;
  }

  $allowStorage() {
    const enrichedThis = this as WgslTexture<TAllows | 'storage'>;
    if (!this._allowedUsages.storage) {
      this._allowedUsages.storage = new WeakMap();
    }
    this.$addFlags(GPUTextureUsage.STORAGE_BINDING);
    return enrichedThis;
  }

  private getStorageIfAllowed(
    params: StorageTextureParams,
  ): WgslTextureView<AnyWgslTexelFormat, 'storage'> | null {
    if (!this._allowedUsages.storage) {
      return null;
    }
    const existing = this._allowedUsages.storage.get(params);
    if (existing) {
      return existing;
    }
    const type = texelFormatToWgslType[this.descriptor.format];
    if (!type) {
      throw new Error(`Unsupported texture format ${this.descriptor.format}`);
    }
    const view = new WgslTextureViewImpl(
      params.type,
      this,
      type,
      params.descriptor,
      params.access,
    ) as unknown as WgslTextureView<typeof type, 'storage'>;
    this._allowedUsages.storage.set(params, view);
    return view;
  }

  private getSampledIfAllowed(
    params: SampledTextureParams,
  ): WgslTextureView<AnyWgslPrimitive, 'sampled'> | null {
    if (!this._allowedUsages.sampled) {
      return null;
    }
    const existing = this._allowedUsages.sampled.get(params);
    if (existing) {
      return existing;
    }
    const view = new WgslTextureViewImpl(
      params.type,
      this,
      params.dataType,
      params.descriptor,
    ) as unknown as WgslTextureView<typeof params.dataType, 'sampled'>;
    this._allowedUsages.sampled.set(params, view);
    return view;
  }

  asStorage(params: StorageTextureParams) {
    const maybeView = this.getStorageIfAllowed(params);
    const maybeType = texelFormatToWgslType[this.descriptor.format];
    if (!maybeType) {
      throw new Error(`Unsupported texture format ${this.descriptor.format}`);
    }
    return maybeView as 'storage' extends TAllows
      ? WgslTextureView<typeof maybeType, 'storage'>
      : null;
  }

  asSampled(params: SampledTextureParams) {
    return this.getSampledIfAllowed(params) as 'sampled' extends TAllows
      ? WgslTextureView<typeof params.dataType, 'sampled'>
      : null;
  }
}

class WgslTextureViewImpl<
  TData extends AnyWgslPrimitive | AnyWgslTexelFormat,
  TUsage extends TextureUsage,
> implements WgslTextureView<TData, TUsage>, WgslAnyTextureView
{
  private _label: string | undefined;

  constructor(
    public readonly type: WgslRenderResourceType,
    public readonly texture: WgslTexture<TUsage>,
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
    const identifier = new WgslIdentifier().$name(this._label);

    ctx.addRenderResource(this, identifier);

    return ctx.resolve(identifier);
  }
}

class WgslTextureExternalImpl implements WgslTextureExternal {
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
    const identifier = new WgslIdentifier().$name(this._label);

    ctx.addRenderResource(this, identifier);

    return ctx.resolve(identifier);
  }
}

export function isExternalTexture(
  texture: WgslRenderResource<WgslRenderResourceType>,
): texture is WgslTextureExternal {
  return !('texture' in texture) && !isSampler(texture);
}

export function isTextureView(
  texture: WgslRenderResource<WgslRenderResourceType>,
): texture is WgslTextureView<
  AnyWgslPrimitive | AnyWgslTexelFormat,
  TextureUsage
> {
  return 'texture' in texture;
}

const texelFormatToWgslType: Record<string, AnyWgslTexelFormat> = {
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
