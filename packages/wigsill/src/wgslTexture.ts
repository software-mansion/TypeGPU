import { vec4f, vec4i, vec4u } from './data';
import type {
  AnyWgslPrimitive,
  AnyWgslTexelFormat,
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
  TData extends AnyWgslTexelFormat,
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
    | WgslStorageTexture<AnyWgslTexelFormat, StorageTextureAccess>;
  readonly descriptor: GPUTextureViewDescriptor;
  readonly type: WgslRenderResourceType;
}

export interface WgslTextureExternal
  extends WgslRenderResource<WgslExternalTextureType> {
  readonly descriptor: GPUExternalTextureDescriptor;
}

export function texture(
  descriptor: GPUTextureDescriptor,
  type: WgslStorageTextureType,
  access: StorageTextureAccess,
): WgslStorageTexture<AnyWgslTexelFormat, StorageTextureAccess>;
export function texture(
  descriptor: GPUTextureDescriptor,
  type: WgslTypedTextureType,
  dataType: AnyWgslPrimitive,
): WgslTexture<AnyWgslPrimitive>;
export function texture(
  descriptor: GPUTextureDescriptor,
  type: WgslTypedTextureType | WgslStorageTextureType,
  dataTypeOrAccess: AnyWgslPrimitive | StorageTextureAccess,
):
  | WgslTexture<AnyWgslPrimitive>
  | WgslStorageTexture<AnyWgslTexelFormat, StorageTextureAccess> {
  if (typeof dataTypeOrAccess === 'string') {
    const access = dataTypeOrAccess as StorageTextureAccess;
    const format = texelFormatToWgslType[descriptor.format];
    if (!format) {
      throw new Error(`Unsupported texture format ${descriptor.format}`);
    }
    return new WgslStorageTextureImpl(
      descriptor,
      format,
      type as WgslStorageTextureType,
      access,
    );
  }

  const dataType = dataTypeOrAccess as AnyWgslPrimitive;
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
  TData extends AnyWgslTexelFormat,
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

class WgslTextureViewImpl implements WgslTextureView {
  private _label: string | undefined;

  constructor(
    public readonly texture:
      | WgslTexture<AnyWgslPrimitive>
      | WgslStorageTexture<AnyWgslTexelFormat, StorageTextureAccess>,
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
