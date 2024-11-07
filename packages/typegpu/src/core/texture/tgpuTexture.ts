import { vec4f, vec4i, vec4u } from '../../data';
import { invariant } from '../../errors';
import type { TgpuNamable } from '../../namable';
import type { TgpuBindGroupLayout } from '../../tgpuBindGroupLayout';
import { code } from '../../tgpuCode';
import { identifier } from '../../tgpuIdentifier';
import { isSampler } from '../../tgpuSampler';
import type {
  ResolutionCtx,
  TextureUsage,
  TgpuRenderResource,
  TgpuRenderResourceType,
} from '../../types';
import type {
  StorageTextureAccess,
  TexelFormat,
  TextureScalarFormat,
} from './textureTypes';

type Optional<T> = {
  [P in keyof T]?: T[P] | undefined;
};

export interface TgpuAnyTextureView extends TgpuRenderResource {
  readonly descriptor: GPUTextureViewDescriptor;
  readonly texture: TgpuAnyTexture;
  readonly dataType: TextureScalarFormat | TexelFormat;
  readonly access: StorageTextureAccess | undefined;
}

export interface TgpuAnyTexture {
  readonly descriptor: Omit<GPUTextureDescriptor, 'usage'>;
  get flags(): GPUTextureUsageFlags;
}

export interface TgpuTextureView<
  TData extends TextureScalarFormat | TexelFormat,
  TUsage extends TextureUsage,
> extends TgpuRenderResource,
    TgpuNamable {
  readonly texture: TgpuTexture<TUsage>;
  readonly descriptor: Omit<GPUTextureViewDescriptor, 'usage'>;
  readonly type: TgpuRenderResourceType;
  readonly dataType: TData;
  readonly access: StorageTextureAccess | undefined;
}

export interface TgpuTextureExternal extends TgpuRenderResource, TgpuNamable {
  readonly descriptor: Optional<GPUExternalTextureDescriptor>;
  get source(): HTMLVideoElement | VideoFrame | undefined;
}

export function texture<TUsage extends TextureUsage = never>(
  descriptor: Omit<GPUTextureDescriptor, 'usage'>,
): TgpuTexture<TUsage> {
  return new TgpuTextureImpl(descriptor);
}

export function textureExternal(
  source?: HTMLVideoElement | VideoFrame,
  colorSpace?: PredefinedColorSpace,
): TgpuTextureExternal {
  return new TgpuTextureExternalImpl(source, colorSpace);
}

class TgpuTextureViewImpl<
  TData extends TextureScalarFormat | TexelFormat,
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
    const ident = identifier().$name(this._label);
    const { groupPlaceholder, binding } = ctx.registerBound(this);

    invariant(
      binding !== undefined,
      'Expected texture view without a layout to be assigned a binding index',
    );

    if (this.access !== undefined) {
      ctx.addDeclaration(
        code`@group(${groupPlaceholder}) @binding(${binding}) var ${ident}: ${this.type}<${this.texture.descriptor.format}, ${this.access}>;`,
      );
    } else {
      ctx.addDeclaration(
        code`@group(${groupPlaceholder}) @binding(${binding}) var ${ident}: ${this.type}<${this.dataType}>;`,
      );
    }

    return ctx.resolve(ident);
  }
}

class TgpuBoundTextureImpl<TData extends TextureScalarFormat | TexelFormat>
  implements TgpuBoundTexture
{
  private _label: string | undefined;

  constructor(
    public readonly type: TgpuRenderResourceType,
    public readonly dataType: TData,
    public readonly access: StorageTextureAccess | undefined,
    public readonly layout: TgpuBindGroupLayout,
    public readonly layoutKey: string,
    public readonly layoutIdx: number,
  ) {}

  get label() {
    return this._label;
  }

  resolve(ctx: ResolutionCtx): string {
    const ident = identifier().$name(this._label);
    const { groupPlaceholder, binding } = ctx.registerBound(this);

    invariant(
      binding !== undefined,
      'Expected texture view without a layout to be assigned a binding index',
    );

    if (this.access !== undefined) {
      ctx.addDeclaration(
        code`@group(${groupPlaceholder}) @binding(${binding}) var ${ident}: ${this.type}<${this.texture.descriptor.format}, ${this.access}>;`,
      );
    } else {
      ctx.addDeclaration(
        code`@group(${groupPlaceholder}) @binding(${binding}) var ${ident}: ${this.type}<${this.dataType}>;`,
      );
    }

    return ctx.resolve(ident);
  }
}

class TgpuTextureExternalImpl implements TgpuTextureExternal {
  private _label: string | undefined;
  public readonly type = 'texture_external';
  public readonly descriptor: Optional<GPUExternalTextureDescriptor>;

  constructor(
    source: HTMLVideoElement | VideoFrame | undefined,
    colorSpace: PredefinedColorSpace | undefined,
  ) {
    this.descriptor = { source, colorSpace };
  }

  get label() {
    return this._label;
  }

  get source() {
    return this.descriptor.source;
  }

  $name(label: string | undefined) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const ident = identifier().$name(this._label);
    ctx.addRenderResource(this, ident);
    return ctx.resolve(ident);
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

function hashFromShallowObj(obj: object): string {
  const withKeysSorted = Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
  );

  return JSON.stringify(withKeysSorted);
}
