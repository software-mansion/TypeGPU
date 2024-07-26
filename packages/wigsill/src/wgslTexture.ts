import type { U32, I32, F32 } from './std140';
import type {
  ResolutionCtx,
  WgslExternalTextureType,
  WgslRenderResource,
  StorageTextureAccess,
  WgslStorageTextureType,
  WgslTypedTextureType,
  WgslAllocatable,
  WgslRenderResourceType,
} from './types';
import { WgslIdentifier } from './wgslIdentifier';

export interface WgslTexture<TData extends U32 | I32 | F32> {
  createView(descriptor?: GPUTextureViewDescriptor): WgslTextureView;
  readonly dataType: TData;
  readonly descriptor: GPUTextureDescriptor;
}

export interface WgslStorageTexture<
  TData extends U32 | I32 | F32,
  TAccess extends StorageTextureAccess,
> extends WgslAllocatable<TData> {
  createView(descriptor?: GPUTextureViewDescriptor): WgslTextureView;
  readonly access: TAccess;
  readonly dataType: TData;
  readonly descriptor: GPUTextureDescriptor;
}

export interface WgslTextureView
  extends WgslRenderResource<WgslRenderResourceType> {
  readonly texture:
    | WgslTexture<U32 | I32 | F32>
    | WgslStorageTexture<U32 | I32 | F32, StorageTextureAccess>;
  readonly descriptor: GPUTextureViewDescriptor;
  readonly type: WgslRenderResourceType;
}

export interface WgslTextureExternal
  extends WgslRenderResource<WgslExternalTextureType> {}

export function texture<TData extends U32 | I32 | F32>(
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

class WgslTextureImpl<TData extends U32 | I32 | F32>
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
  TData extends U32 | I32 | F32,
  TAccess extends StorageTextureAccess,
> implements WgslStorageTexture<TData, TAccess>
{
  readonly flags: number;
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
}

class WgslTextureViewImpl<TData extends U32 | I32 | F32>
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
