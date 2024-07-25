import type {
  ResolutionCtx,
  WgslRenderResource,
  WgslRenderResourceType,
} from './types';
import { WgslIdentifier } from './wgslIdentifier';

export interface WgslTexture extends WgslRenderResource {
  createView(descriptor?: GPUTextureViewDescriptor): WgslTextureView;
}

export interface WgslTextureView extends WgslRenderResource {}

export interface WgslTextureExternal extends WgslRenderResource {}

class WgslTextureImpl implements WgslTexture {
  private _label: string | undefined;
  private _type: WgslRenderResourceType;

  constructor(private _descriptor: GPUTextureDescriptor) {}

  get label() {
    return this._label;
  }

  get descriptor() {
    return this._descriptor;
  }

  $name(label: string | undefined) {
    this._label = label;
    return this;
  }

  createView(descriptor?: GPUTextureViewDescriptor): WgslTextureView {
    return new WgslTextureViewImpl(this, descriptor);
  }

  resolve(ctx: ResolutionCtx): string {
    const identifier = new WgslIdentifier().$name(this._label);

    ctx.addRenderResource(this, identifier);

    return ctx.resolve(identifier);
  }
}

class WgslTextureViewImpl implements WgslTextureView {
  private _label: string | undefined;

  constructor(
    private _texture: WgslTexture,
    private _descriptor?: GPUTextureViewDescriptor,
  ) {}

  get label() {
    return this._label;
  }

  get texture() {
    return this._texture;
  }

  get descriptor() {
    return this._descriptor;
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
