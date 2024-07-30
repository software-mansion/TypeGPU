import type {
  AnyWgslPrimitive,
  ResolutionCtx,
  StorageTextureAccess,
  WgslExternalTextureType,
  WgslRenderResource,
  WgslRenderResourceType,
  WgslStorageTextureType,
  WgslTypedTextureType,
} from './types';
import { WgslIdentifier } from './wgslIdentifier';
import { isSampler } from './wgslSampler';

export interface WgslTexture<TData extends AnyWgslPrimitive> {
  createView(descriptor?: GPUTextureViewDescriptor): WgslTextureView;
  readonly dataType: TData;
  readonly descriptor: GPUTextureDescriptor;
}

export interface WgslStorageTexture<
  TData extends AnyWgslPrimitive,
  TAccess extends StorageTextureAccess,
> {
  createView(descriptor?: GPUTextureViewDescriptor): WgslTextureView;
  readonly access: TAccess;
  readonly dataType: TData;
  readonly descriptor: GPUTextureDescriptor;
}

export interface WgslTextureView
  extends WgslRenderResource<WgslRenderResourceType> {
  readonly texture:
    | WgslTexture<AnyWgslPrimitive>
    | WgslStorageTexture<AnyWgslPrimitive, StorageTextureAccess>;
  readonly descriptor: GPUTextureViewDescriptor;
  readonly type: WgslRenderResourceType;
}

export interface WgslTextureExternal
  extends WgslRenderResource<WgslExternalTextureType> {
  readonly descriptor: GPUExternalTextureDescriptor;
}

export function texture<TData extends AnyWgslPrimitive>(
  descriptor: GPUTextureDescriptor,
  dataType: TData,
  type: WgslTypedTextureType | WgslStorageTextureType,
  access?: StorageTextureAccess,
): WgslTexture<TData> | WgslStorageTexture<TData, StorageTextureAccess> {
  if (access) {
    return new WgslStorageTextureImpl(
      descriptor,
      dataType,
      type as WgslStorageTextureType,
      access,
    );
  }

  return new WgslTextureImpl(
    descriptor,
    dataType,
    type as WgslTypedTextureType,
  );
}

export function textureExternal(descriptor: GPUExternalTextureDescriptor) {
  return new WgslTextureExternalImpl(descriptor);
}

class WgslTextureImpl<TData extends AnyWgslPrimitive>
  implements WgslTexture<TData>
{
  private _label: string | undefined;

  constructor(
    public readonly descriptor: GPUTextureDescriptor,
    public readonly dataType: TData,
    public readonly type: WgslTypedTextureType,
  ) {}

  get label() {
    return this._label;
  }

  createView(descriptor: GPUTextureViewDescriptor): WgslTextureView {
    return new WgslTextureViewImpl(this, descriptor, this.type);
  }
}

class WgslStorageTextureImpl<
  TData extends AnyWgslPrimitive,
  TAccess extends StorageTextureAccess,
> implements WgslStorageTexture<TData, TAccess>
{
  private _label: string | undefined;
  readonly flags: number;
  readonly vertexLayout: Omit<GPUVertexBufferLayout, 'attributes'> | null =
    null;
  constructor(
    public readonly descriptor: GPUTextureDescriptor,
    public readonly dataType: TData,
    public readonly type: WgslStorageTextureType,
    public readonly access: TAccess,
  ) {
    this.flags = this.descriptor.usage;
  }

  createView(descriptor: GPUTextureViewDescriptor): WgslTextureView {
    return new WgslTextureViewImpl(this, descriptor, this.type);
  }

  get label() {
    return this._label;
  }

  $name(label: string | undefined) {
    this._label = label;
    return this;
  }
}

class WgslTextureViewImpl<TData extends AnyWgslPrimitive>
  implements WgslTextureView
{
  private _label: string | undefined;

  constructor(
    public readonly texture:
      | WgslTexture<TData>
      | WgslStorageTexture<TData, StorageTextureAccess>,
    public readonly descriptor: GPUTextureViewDescriptor,
    public readonly type: WgslRenderResourceType,
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
): texture is WgslTextureView {
  return 'texture' in texture;
}
