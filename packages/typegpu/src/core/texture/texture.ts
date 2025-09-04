import {
  isWgslStorageTexture,
  textureDescriptorToSchema,
  type TextureSchemaForDescriptor,
  type WgslStorageTexture,
  type WgslTexture,
  type WgslTextureProps,
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
import type { ValidateTextureViewSchema } from '../../shared/repr.ts';
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
import {
  type TexelFormatToChannelType,
  texelFormatToChannelType,
} from './textureFormats.ts';
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

type TgpuTextureViewDescriptor = {
  /**
   * Which {@link GPUTextureAspect | aspect(s)} of the texture are accessible to the texture view.
   */
  aspect?: GPUTextureAspect;
  /**
   * The first (most detailed) mipmap level accessible to the texture view.
   */
  baseMipLevel?: GPUIntegerCoordinate;
  /**
   * How many mipmap levels, starting with {@link GPUTextureViewDescriptor#baseMipLevel}, are accessible to
   * the texture view.
   */
  mipLevelCount?: GPUIntegerCoordinate;
  /**
   * The index of the first array layer accessible to the texture view.
   */
  baseArrayLayer?: GPUIntegerCoordinate;
  /**
   * How many array layers, starting with {@link GPUTextureViewDescriptor#baseArrayLayer}, are accessible
   * to the texture view.
   */
  arrayLayerCount?: GPUIntegerCoordinate;
  /**
   * The format of the texture view. Must be either the {@link GPUTextureDescriptor#format} of the
   * texture or one of the {@link GPUTextureDescriptor#viewFormats} specified during its creation.
   */
  format?: GPUTextureFormat;
};

type DefaultViewSchema<T extends TextureProps> = TextureSchemaForDescriptor<{
  dimension: Default<T['dimension'], '2d'>;
  sampleType: TexelFormatToChannelType[T['format']];
  multisampled: Default<T['sampleCount'], 1> extends 1 ? false : true;
}>;

type ViewDimensionToTextureDimension = {
  '1d': '1d';
  '2d': '2d';
  '2d-array': '2d';
  'cube': '2d';
  'cube-array': '2d';
  '3d': '3d';
};

export type PropsForSchema<T extends WgslTexture | WgslStorageTexture> =
  T extends WgslTexture ? {
      size: readonly number[];
      format: GPUTextureFormat;
      dimension?: T['dimension'] extends keyof ViewDimensionToTextureDimension
        ? ViewDimensionToTextureDimension[T['dimension']]
        : never;
      sampleCount?: T['multisampled'] extends true ? 4 : 1 | undefined;
    }
    : T extends WgslStorageTexture ? {
        size: readonly number[];
        format: T['format'];
        dimension?: T['dimension'] extends keyof ViewDimensionToTextureDimension
          ? ViewDimensionToTextureDimension[T['dimension']]
          : never;
        sampleCount?: 1 | undefined;
      }
    : never;

function getDescriptorForProps<T extends TextureProps>(
  props: T,
): WgslTextureProps {
  return {
    dimension: (props.dimension ?? '2d') as Default<T['dimension'], '2d'>,
    sampleType: texelFormatToChannelType[props.format],
    multisampled: !((props.sampleCount ?? 1) === 1) as Default<
      T['sampleCount'],
      1
    > extends 1 ? false
      : true,
  };
}

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

  createView(
    ...args: this['usableAsSampled'] extends true ? []
      : [ValidateTextureViewSchema<this, WgslTexture>]
  ): TgpuTextureView<DefaultViewSchema<TProps>>;
  createView<T extends WgslTexture | WgslStorageTexture>(
    schema: ValidateTextureViewSchema<this, T>,
    viewDescriptor?: TgpuTextureViewDescriptor & {
      sampleType?: T extends WgslTexture
        ? T['sampleType']['type'] extends 'f32' ? 'float' | 'unfilterable-float'
        : never
        : never;
    },
  ): TgpuTextureView<T>;

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
  TSchema extends WgslStorageTexture | WgslTexture =
    | WgslStorageTexture
    | WgslTexture,
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

  createView(
    ...args: this['usableAsSampled'] extends true ? [] : [never]
  ): TgpuTextureView<DefaultViewSchema<TextureProps>>;
  createView<T extends WgslTexture | WgslStorageTexture>(
    schema: never,
    viewDescriptor?: TgpuTextureViewDescriptor & {
      sampleType?: T extends WgslTexture
        ? T['sampleType']['type'] extends 'f32' ? 'float' | 'unfilterable-float'
        : never
        : never;
    },
  ): TgpuTextureView<T>;
  createView<T extends WgslTexture | WgslStorageTexture>(
    schema?: never,
    viewDescriptor?: TgpuTextureViewDescriptor & {
      sampleType?: T extends WgslTexture
        ? T['sampleType']['type'] extends 'f32' ? 'float' | 'unfilterable-float'
        : never
        : never;
    },
  ): TgpuTextureView<T> {
    return new TgpuFixedTextureViewImpl(
      schema ??
        (textureDescriptorToSchema(getDescriptorForProps(this.props)) as T),
      this,
      viewDescriptor,
    );
  }

  destroy() {}
}

class TgpuFixedTextureViewImpl<T extends WgslTexture | WgslStorageTexture>
  implements TgpuTextureView<T>, SelfResolvable {
  readonly [$internal]: TextureViewInternals;
  readonly [$runtimeResource] = true;
  readonly [$getNameForward]: TgpuTexture;
  readonly [$repr]: T = undefined as unknown as T;

  readonly resourceType = 'texture-view';
  readonly schema: T;

  #baseTexture: TgpuTexture;
  #view: GPUTextureView | undefined;
  #descriptor:
    | (TgpuTextureViewDescriptor & {
      sampleType?: T extends WgslTexture ? 'float' | 'unfilterable-float'
        : never;
    })
    | undefined;

  constructor(
    schema: T,
    baseTexture: TgpuTexture,
    descriptor?: TgpuTextureViewDescriptor,
  ) {
    this.schema = schema;
    this.#baseTexture = baseTexture;
    this.#descriptor = descriptor;

    this[$internal] = {
      unwrap: () => {
        if (!this.#view) {
          const schema = this.schema;
          let descriptor: GPUTextureViewDescriptor;
          if (isWgslStorageTexture(schema)) {
            descriptor = {
              label: getName(this) ?? '<unnamed>',
              format: this.#descriptor?.format ?? schema.format,
              dimension: schema.dimension,
            };
          } else {
            descriptor = {
              label: getName(this) ?? '<unnamed>',
              format: this.#descriptor?.format ??
                this.#baseTexture.props.format,
              dimension: schema.dimension,
            };
          }

          if (this.#descriptor?.mipLevelCount !== undefined) {
            descriptor.mipLevelCount = this.#descriptor.mipLevelCount;
          }
          if (this.#descriptor?.arrayLayerCount !== undefined) {
            descriptor.arrayLayerCount = this.#descriptor.arrayLayerCount;
          }

          this.#view = this.#baseTexture[$internal]
            .unwrap()
            .createView(descriptor);
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
      isWgslStorageTexture(this.schema)
        ? {
          storageTexture: this.schema,
        }
        : {
          texture: this.schema,
          sampleType: this.#descriptor?.sampleType ??
            this.schema.bindingSampleType[0],
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
  T extends WgslTexture | WgslStorageTexture,
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
