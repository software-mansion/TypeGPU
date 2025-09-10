import {
  isWgslStorageTexture,
  textureDescriptorToSchema,
  type TextureSchemaForDescriptor,
  type WgslStorageTexture,
  type WgslTexture,
  type WgslTextureProps,
} from '../../data/texture.ts';
import type { Vec4f, Vec4i, Vec4u } from '../../data/wgslTypes.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { ValidateTextureViewSchema } from '../../shared/repr.ts';
import type {
  TextureFormatInfo,
  ViewDimensionToDimension,
} from './textureFormats.ts';
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
  TypedArray,
  UnionToIntersection,
} from '../../shared/utilityTypes.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';
import {
  type TexelFormatToChannelType,
  texelFormatToChannelType,
  textureFormats,
} from './textureFormats.ts';
import type { TextureProps } from './textureProps.ts';
import type { AllowedUsages, LiteralToExtensionMap } from './usageExtension.ts';
import {
  generateTextureMipmaps,
  getImageSourceDimensions,
  resampleImage,
} from './textureUtils.ts';

type TextureInternals = {
  unwrap(): GPUTexture;
};

type TextureViewInternals = {
  readonly unwrap: (() => GPUTextureView) | undefined;
};

// ----------
// Public API
// ----------

export type TexelData = Vec4u | Vec4i | Vec4f;

export type ExternalImageSource =
  | HTMLCanvasElement
  | HTMLImageElement
  | HTMLVideoElement
  | ImageBitmap
  | ImageData
  | OffscreenCanvas
  | VideoFrame;

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

type DefaultViewSchema<T extends Partial<TextureProps>> =
  TextureSchemaForDescriptor<{
    dimension: Default<T['dimension'], '2d'>;
    sampleType: T['format'] extends keyof TexelFormatToChannelType
      ? TexelFormatToChannelType[T['format']]
      : TexelFormatToChannelType[keyof TexelFormatToChannelType];
    multisampled: Default<T['sampleCount'], 1> extends 1 ? false : true;
  }>;

type BaseDimension<T extends string> = T extends keyof ViewDimensionToDimension
  ? ViewDimensionToDimension[T]
  : never;

type OptionalDimension<T extends string> = T extends
  '2d' | '2d-array' | 'cube' | 'cube-array' ? { dimension?: BaseDimension<T> }
  : { dimension: BaseDimension<T> };

type MultisampledProps<T extends WgslTexture> = T['multisampled'] extends true
  ? OptionalDimension<T['dimension']> & { sampleCount: 4 }
  : OptionalDimension<T['dimension']> & { sampleCount?: 1 };

export type PropsForSchema<T extends WgslTexture | WgslStorageTexture> =
  T extends WgslTexture ?
      & { size: readonly number[]; format: GPUTextureFormat }
      & MultisampledProps<T>
    : T extends WgslStorageTexture ? {
        size: readonly number[];
        format: T['format'];
      } & OptionalDimension<T['dimension']>
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

export type TextureAspect = 'color' | 'depth' | 'stencil';
export type DepthStencilFormats =
  | 'depth24plus-stencil8'
  | 'depth32float-stencil8';
export type DepthFormats = 'depth16unorm' | 'depth24plus' | 'depth32float';
export type StencilFormats = 'stencil8';

export type AspectsForFormat<T extends GPUTextureFormat> =
  GPUTextureFormat extends T ? TextureAspect
    : T extends DepthStencilFormats ? 'depth' | 'stencil'
    : never | T extends DepthFormats ? 'depth'
    : never | T extends StencilFormats ? 'stencil'
    : never | 'color';

type CopyCompatibleTexture<T extends TextureProps> = TgpuTexture<{
  size: T['size'];
  format: T['format'];
  sampleCount?: T['sampleCount'];
}>;

/**
 * @param TProps all properties that distinguish this texture apart from other textures on the type level.
 */
export interface TgpuTexture<TProps extends TextureProps = TextureProps>
  extends TgpuNamable {
  readonly [$internal]: TextureInternals;
  readonly resourceType: 'texture';
  readonly props: TProps; // <- storing to be able to differentiate structurally between different textures.
  readonly aspects: AspectsForFormat<TProps['format']>[];
  readonly destroyed: boolean;

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

  clear(mipLevel?: number | 'all'): void;
  generateMipmaps(baseMipLevel?: number, mipLevels?: number): void;
  write(
    source: Required<TProps['dimension']> extends '3d' ? ExternalImageSource[]
      : ExternalImageSource,
  ): void;
  write(source: ArrayBuffer | TypedArray | DataView, mipLevel?: number): void;
  // TODO: support copies from GPUBuffers and TgpuBuffers
  copyFrom<T extends CopyCompatibleTexture<TProps>>(source: T): void;

  destroy(): void;
}

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

class TgpuTextureImpl<TProps extends TextureProps>
  implements TgpuTexture<TProps> {
  readonly [$internal]: TextureInternals;
  readonly resourceType = 'texture';
  readonly aspects: AspectsForFormat<this['props']['format']>[];
  usableAsSampled = false;
  usableAsStorage = false;
  usableAsRender = false;

  #formatInfo: TextureFormatInfo;
  #byteSize: number;
  #destroyed = false;
  #flags = GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC;
  #texture: GPUTexture | null = null;
  #branch: ExperimentalTgpuRoot;

  constructor(
    public readonly props: TProps,
    branch: ExperimentalTgpuRoot,
  ) {
    const format = this.props.format;

    this.#branch = branch;
    this.#formatInfo = textureFormats[format];
    this.#byteSize = this.props.size[0] as number *
      (this.props.size[1] ?? 1) *
      (this.props.size[2] ?? 1) * this.#formatInfo.texelSize;
    this.aspects = (
      format === 'depth24plus-stencil8' || format === 'depth32float-stencil8'
        ? ['depth', 'stencil']
        : format === 'depth16unorm' || format === 'depth24plus' ||
            format === 'depth32float'
        ? ['depth']
        : format === 'stencil8'
        ? ['stencil']
        : ['color']
    ) as AspectsForFormat<this['props']['format']>[];

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
  ): TgpuTextureView<DefaultViewSchema<TProps>>;
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
      this as TgpuTexture,
      viewDescriptor,
    );
  }

  #clearMipLevel(mip = 0) {
    const scale = 2 ** mip;
    const [width, height, depth] = [
      Math.max(1, Math.floor((this.props.size[0] ?? 1) / scale)),
      Math.max(1, Math.floor((this.props.size[1] ?? 1) / scale)),
      Math.max(1, Math.floor((this.props.size[2] ?? 1) / scale)),
    ];

    this.#branch.device.queue.writeTexture(
      { texture: this[$internal].unwrap(), mipLevel: mip },
      new Uint8Array(width * height * depth * this.#formatInfo.texelSize),
      { bytesPerRow: this.#formatInfo.texelSize * width, rowsPerImage: height },
      [width, height, depth],
    );
  }

  clear(mipLevel: number | 'all' = 'all') {
    if (mipLevel === 'all') {
      const mipLevels = this.props.mipLevelCount ?? 1;
      for (let i = 0; i < mipLevels; i++) {
        this.#clearMipLevel(i);
      }
    } else {
      this.#clearMipLevel(mipLevel);
    }
  }

  generateMipmaps(baseMipLevel = 0, mipLevels?: number) {
    const actualMipLevels = mipLevels ??
      (this.props.mipLevelCount ?? 1) - baseMipLevel;

    if (actualMipLevels <= 1) {
      console.warn(
        `generateMipmaps is a no-op: would generate ${actualMipLevels} mip levels (base: ${baseMipLevel}, total: ${
          this.props.mipLevelCount ?? 1
        })`,
      );
      return;
    }

    if (baseMipLevel >= (this.props.mipLevelCount ?? 1)) {
      throw new Error(
        `Base mip level ${baseMipLevel} is out of range. Texture has ${
          this.props.mipLevelCount ?? 1
        } mip levels.`,
      );
    }

    generateTextureMipmaps(
      this.#branch.device,
      this[$internal].unwrap(),
      baseMipLevel,
      actualMipLevels,
    );
  }

  write(source: ExternalImageSource | ExternalImageSource[]): void;
  write(source: ArrayBuffer | TypedArray | DataView, mipLevel?: number): void;
  write(
    source:
      | ExternalImageSource
      | ExternalImageSource[]
      | ArrayBuffer
      | TypedArray
      | DataView,
    mipLevel = 0,
  ) {
    if (
      source instanceof ArrayBuffer ||
      ArrayBuffer.isView(source)
    ) {
      this.#writeBufferData(source, mipLevel);
      return;
    }

    const dimension = this.props.dimension ?? '2d';
    const isArray = Array.isArray(source);

    if (isArray && dimension !== '3d') {
      throw new Error(
        'Array of image sources can only be used with 3D textures',
      );
    }

    if (!isArray) {
      this.#writeSingleLayer(source, dimension === '3d' ? 0 : undefined);
      return;
    }

    const depthLayers = this.props.size[2] ?? 1;
    if (source.length > depthLayers) {
      console.warn(
        `Too many image sources provided for 3D texture. Expected ${depthLayers} layers, got ${source.length}. Extra sources will be ignored.`,
      );
    }

    for (let layer = 0; layer < Math.min(source.length, depthLayers); layer++) {
      const bitmap = source[layer];
      if (bitmap) {
        this.#writeSingleLayer(bitmap, layer);
      }
    }
  }

  #writeBufferData(
    source: ArrayBuffer | TypedArray | DataView,
    mipLevel: number,
  ) {
    const mipWidth = Math.max(1, (this.props.size[0] as number) >> mipLevel);
    const mipHeight = Math.max(1, (this.props.size[1] ?? 1) >> mipLevel);
    const mipDepth = Math.max(1, (this.props.size[2] ?? 1) >> mipLevel);

    const expectedSize = mipWidth * mipHeight * mipDepth *
      this.#formatInfo.texelSize;
    const actualSize = source.byteLength ?? (source as ArrayBuffer).byteLength;

    if (actualSize !== expectedSize) {
      throw new Error(
        `Buffer size mismatch. Expected ${expectedSize} bytes for mip level ${mipLevel}, got ${actualSize} bytes.`,
      );
    }

    this.#branch.device.queue.writeTexture(
      {
        texture: this[$internal].unwrap(),
        mipLevel,
      },
      source,
      {
        bytesPerRow: this.#formatInfo.texelSize * mipWidth,
        rowsPerImage: mipHeight,
      },
      [mipWidth, mipHeight, mipDepth],
    );
  }

  #writeSingleLayer(source: ExternalImageSource, layer?: number) {
    const targetWidth = this.props.size[0] as number;
    const targetHeight = (this.props.size[1] ?? 1) as number;
    const { width: sourceWidth, height: sourceHeight } =
      getImageSourceDimensions(source);
    const needsResampling = sourceWidth !== targetWidth ||
      sourceHeight !== targetHeight;

    if (needsResampling) {
      resampleImage(
        this.#branch.device,
        this[$internal].unwrap(),
        source,
        layer,
      );
      return;
    }

    this.#branch.device.queue.copyExternalImageToTexture(
      { source },
      {
        texture: this[$internal].unwrap(),
        ...(layer !== undefined && { origin: { x: 0, y: 0, z: layer } }),
      },
      layer !== undefined ? [targetWidth, targetHeight, 1] : this.props.size,
    );
  }

  copyFrom(source: CopyCompatibleTexture<TProps>) {
    if (source.props.format !== this.props.format) {
      throw new Error(
        `Texture format mismatch. Source texture has format ${source.props.format}, target texture has format ${this.props.format}`,
      );
    }
    if (
      source.props.size[0] !== this.props.size[0] ||
      (source.props.size[1] ?? 1) !== (this.props.size[1] ?? 1) ||
      (source.props.size[2] ?? 1) !== (this.props.size[2] ?? 1)
    ) {
      throw new Error(
        `Texture size mismatch. Source texture has size ${
          source.props.size.join('x')
        }, target texture has size ${this.props.size.join('x')}`,
      );
    }

    const commandEncoder = this.#branch.device.createCommandEncoder();
    commandEncoder.copyTextureToTexture(
      { texture: source[$internal].unwrap() },
      { texture: this[$internal].unwrap() },
      source.props.size,
    );
    this.#branch.device.queue.submit([commandEncoder.finish()]);
  }

  get destroyed() {
    return this.#destroyed;
  }

  destroy() {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#texture?.destroy();
  }
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
