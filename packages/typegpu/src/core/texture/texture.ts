import type {
  WgslSampledTexture,
  WgslStorageTexture,
} from '../../data/texture.ts';
import type {
  F32,
  I32,
  U32,
  Vec4f,
  Vec4i,
  Vec4u,
} from '../../data/wgslTypes.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import {
  $getNameForward,
  $gpuValueOf,
  $internal,
  $repr,
  $runtimeResource,
  $wgslDataType,
} from '../../shared/symbols.ts';
import type {
  Default,
  UnionToIntersection,
} from '../../shared/utilityTypes.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';
import type { TextureProps } from './textureProps.ts';
import type { AllowedUsages, LiteralToExtensionMap } from './usageExtension.ts';

type TextureInternals = {
  unwrap(): GPUTexture;
};

type TextureViewInternals = {
  readonly unwrap: (() => GPUTextureView) | undefined;
};

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

  createView<T extends WgslSampledTexture | WgslStorageTexture>(
    schema: T,
  ): TgpuTextureView<T>;
  createView(): TgpuTextureView<
    WgslSampledTexture<Default<TProps['dimension'], '2d'>>
  >;

  destroy(): void;
}

export type StorageTextureAccess = 'readonly' | 'writeonly' | 'mutable';

export type TextureViewParams<
  TDimension extends GPUTextureViewDimension | undefined,
  TFormat extends GPUTextureFormat | undefined,
> = {
  format?: TFormat;
  dimension?: TDimension;
  aspect?: GPUTextureAspect;
  baseMipLevel?: number;
  mipLevelCount?: number;
  baseArrayLayer?: number;
  arrayLayerCount?: number;
};

export interface TgpuTextureView<
  TSchema extends WgslStorageTexture | WgslSampledTexture =
    | WgslStorageTexture
    | WgslSampledTexture,
> {
  readonly [$internal]: TextureViewInternals;
  readonly resourceType: 'texture-view';
  readonly schema: TSchema;

  [$gpuValueOf](ctx: ResolutionCtx): TSchema;
  value: TSchema;
  $: TSchema;
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

export function isTextureView<T extends TgpuTextureView>(
  value: unknown | T,
): value is T {
  return (
    (value as T)?.resourceType === 'texture-view' && !!(value as T)[$internal]
  );
}

// --------------
// Implementation
// --------------

class TgpuTextureImpl implements TgpuTexture {
  readonly [$internal]: TextureInternals;
  readonly resourceType = 'texture';
  usableAsSampled = false;
  usableAsStorage = false;
  usableAsRender = false;
  usableAsDepth = false;

  #destroyed = false;
  #flags = GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC;
  #texture: GPUTexture | null = null;
  #branch: ExperimentalTgpuRoot;

  constructor(
    public readonly props: TextureProps,
    branch: ExperimentalTgpuRoot,
  ) {
    this.#branch = branch;
    this[$internal] = {
      unwrap: () => {
        if (this.#destroyed) {
          throw new Error('This texture has been destroyed');
        }

        if (!this.#texture) {
          this.#texture = this.#branch.device.createTexture({
            label: getName(this) ?? '<unnamed>',
            format: this.props.format,
            size: this.props.size,
            usage: this.#flags,
            dimension: this.props.dimension ?? '2d',
            viewFormats: this.props.viewFormats ?? [],
            mipLevelCount: this.props.mipLevelCount ?? 1,
            sampleCount: this.props.sampleCount ?? 1,
          });
        }

        return this.#texture;
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
    this.#flags |= hasSampled ? GPUTextureUsage.TEXTURE_BINDING : 0;
    this.#flags |= hasStorage ? GPUTextureUsage.STORAGE_BINDING : 0;
    this.#flags |= hasRender ? GPUTextureUsage.RENDER_ATTACHMENT : 0;
    this.usableAsStorage ||= hasStorage;
    this.usableAsSampled ||= hasSampled;
    this.usableAsRender ||= hasRender;

    return this as this & UnionToIntersection<LiteralToExtensionMap[T[number]]>;
  }

  createView(): TgpuTextureView<
    WgslSampledTexture<'2d', 'float', false>
  >;
  createView<T extends WgslSampledTexture | WgslStorageTexture>(
    schema: T,
  ): TgpuTextureView<T>;
  createView<T extends WgslSampledTexture | WgslStorageTexture>(
    schema?: T,
  ): TgpuTextureView<T> {
    return new TgpuFixedTextureViewImpl(
      schema ??
        {
          viewDimension: this.props.dimension ?? '2d',
          sampleType: 'float',
          multisampled: (this.props.sampleCount ?? 1) > 1,
        } as unknown as T,
      this,
    );
  }

  destroy() {}
}

class TgpuFixedTextureViewImpl<
  T extends WgslSampledTexture | WgslStorageTexture,
> implements TgpuTextureView<T>, SelfResolvable {
  readonly [$internal]: TextureViewInternals;
  readonly [$runtimeResource] = true;
  readonly [$getNameForward]: TgpuTexture;
  readonly [$repr]: T = undefined as unknown as T;

  readonly resourceType = 'texture-view';
  readonly schema: T;

  #baseTexture: TgpuTexture;
  #view: GPUTextureView | undefined;

  constructor(schema: T, baseTexture: TgpuTexture) {
    this.schema = schema;
    this.#baseTexture = baseTexture;

    this[$internal] = {
      unwrap: () => {
        if (!this.#view) {
          const descriptor: GPUTextureViewDescriptor = {
            label: getName(this) ?? '<unnamed>',
            format: schema.format ?? this.#baseTexture.props.format,
            dimension: schema.viewDimension,
            aspect: schema.aspect,
            baseMipLevel: schema.baseMipLevel,
            baseArrayLayer: schema.baseArrayLayer,
          };

          if (schema.mipLevelCount !== undefined) {
            descriptor.mipLevelCount = schema.mipLevelCount;
          }
          if (schema.arrayLayerCount !== undefined) {
            descriptor.arrayLayerCount = schema.arrayLayerCount;
          }

          this.#view = this.#baseTexture[$internal].unwrap().createView(
            descriptor,
          );
        }
        return this.#view;
      },
    };
    this[$getNameForward] = baseTexture;
  }

  [$gpuValueOf](): T {
    return new Proxy(
      {
        [$internal]: true,
        [$runtimeResource]: true,
        [$wgslDataType]: this.schema,
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
      },
      valueProxyHandler,
    ) as unknown as T;
  }

  get $(): T {
    if (inCodegenMode()) {
      return this[$gpuValueOf]();
    }

    throw new Error(
      'Direct access to texture view values is possible only as part of a compute dispatch or draw call. Try .read() or .write() instead',
    );
  }

  get value(): T {
    return this.$;
  }

  toString() {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));
    const { group, binding } = ctx.allocateFixedEntry(
      {
        texture: this.schema,
      },
      this,
    );

    ctx.addDeclaration(
      `@group(${group}) @binding(${binding}) var ${id}: ${
        ctx.resolve(this.schema)
      };`,
    );

    return id;
  }
}

export class TgpuLaidOutTextureViewImpl<
  T extends WgslSampledTexture | WgslStorageTexture,
> implements TgpuTextureView<T>, SelfResolvable {
  readonly [$internal] = { unwrap: undefined };
  readonly [$runtimeResource] = true;
  readonly [$repr]: T = undefined as unknown as T;

  readonly resourceType = 'texture-view';
  readonly schema: T;

  constructor(
    schema: T,
    private readonly _membership: LayoutMembership,
  ) {
    this.schema = schema;
    setName(this, _membership.key);
  }

  toString() {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));
    const group = ctx.allocateLayoutEntry(this._membership.layout);

    ctx.addDeclaration(
      `@group(${group}) @binding(${this._membership.idx}) var ${id}: ${
        ctx.resolve(this.schema)
      };`,
    );

    return id;
  }

  [$gpuValueOf](): T {
    return new Proxy(
      {
        [$internal]: true,
        [$runtimeResource]: true,
        [$wgslDataType]: this.schema,
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
      },
      valueProxyHandler,
    ) as unknown as T;
  }

  get $(): T {
    if (inCodegenMode()) {
      return this[$gpuValueOf]();
    }

    throw new Error(
      'Direct access to texture views values is possible only as part of a compute dispatch or draw call. Try .read() or .write() instead',
    );
  }

  get value(): T {
    return this.$;
  }
}
