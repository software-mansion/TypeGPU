import {
  isWgslStorageTexture,
  textureDescriptorToSchema,
  type TextureSchemaForDescriptor,
  type WgslStorageTexture,
  type WgslTexture,
  type WgslTextureProps,
} from '../../data/texture.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { StorageFlag } from '../../extension.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import type { F32, Vec4f, Vec4i, Vec4u } from '../../data/wgslTypes.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { Infer, ValidateTextureViewSchema } from '../../shared/repr.ts';
import {
  getTextureFormatInfo,
  type TextureFormatInfo,
  type TextureFormats,
  type ViewDimensionToDimension,
} from './textureFormats.ts';
import { $gpuValueOf, $internal, $ownSnippet, $repr, $resolve } from '../../shared/symbols.ts';
import type { Default, TypedArray, UnionToIntersection } from '../../shared/utilityTypes.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';
import type { TextureProps } from './textureProps.ts';
import type {
  AllowedUsages,
  LiteralToExtensionMap,
  RenderFlag,
  SampledFlag,
} from './usageExtension.ts';
import {
  clearTextureWithColor,
  copyImageToTexture,
  generateTextureMipmaps,
  resampleImages,
} from './textureUtils.ts';
import {
  createBitmapForBlobWrite,
  imageWriteForLayer,
  mipLevelSize,
  needsResize,
  normalizeImageWrite,
  textureLayerSize,
  validateResizeAllowed,
  type TextureBlobWriteOptions,
  type TextureCopyOptions,
  type TextureImageWrite,
  type TextureImageWriteLayout,
  type TextureRawWriteOptions,
  type TextureWriteOptions,
} from './textureWrite.ts';

export type TextureInternals = {
  readonly device: GPUDevice;
  unwrap(): GPUTexture;
};

type TextureViewInternals = {
  readonly unwrap: (() => GPUTextureView) | undefined;
};

// Public API

export type TexelData = Vec4u | Vec4i | Vec4f;
export type {
  TextureBlobWriteOptions,
  TextureChannel,
  TextureCopyOptions,
  TextureRawWriteOptions,
  TextureWriteOptions,
} from './textureWrite.ts';

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

type DefaultViewSchema<T extends Partial<TextureProps>> = TextureSchemaForDescriptor<{
  dimension: Default<T['dimension'], '2d'>;
  sampleType: T['format'] extends keyof TextureFormats
    ? TextureFormats[T['format']]['channelType']
    : TextureFormats[keyof TextureFormats]['channelType'];
  multisampled: Default<T['sampleCount'], 1> extends 1 ? false : true;
}>;

type BaseDimension<T extends string> = T extends keyof ViewDimensionToDimension
  ? ViewDimensionToDimension[T]
  : never;

type OptionalDimension<T extends string> = T extends '2d' | '2d-array' | 'cube' | 'cube-array'
  ? { dimension?: BaseDimension<T> }
  : { dimension: BaseDimension<T> };

type MultisampledProps<T extends WgslTexture> = T['multisampled'] extends true
  ? OptionalDimension<T['dimension']> & { sampleCount: 4 }
  : OptionalDimension<T['dimension']> & { sampleCount?: 1 };

export type PropsForSchema<T extends WgslTexture | WgslStorageTexture> = T extends WgslTexture
  ? {
      size: readonly number[];
      format: GPUTextureFormat;
    } & MultisampledProps<T>
  : T extends WgslStorageTexture
    ? {
        size: readonly number[];
        format: T['format'];
      } & OptionalDimension<T['dimension']>
    : never;

function getDescriptorForProps<T extends TextureProps>(props: T): WgslTextureProps {
  return {
    dimension: (props.dimension ?? '2d') as Default<T['dimension'], '2d'>,
    sampleType: getTextureFormatInfo(props.format).channelType,
    multisampled: !((props.sampleCount ?? 1) === 1) as Default<T['sampleCount'], 1> extends 1
      ? false
      : true,
  };
}

type CopyCompatibleTexture<T extends TextureProps> = TgpuTexture<{
  size: T['size'];
  format: T['format'];
  sampleCount?: T['sampleCount'];
}>;

type FormatCompatibleTexture<T extends TextureProps> = TgpuTexture<{
  size: readonly number[];
  format: T['format'];
  dimension?: TextureProps['dimension'];
  sampleCount?: T['sampleCount'];
}>;

// oxlint-disable-next-line typescript/no-explicit-any -- we can't tame the validation otherwise
export interface TgpuTexture<TProps extends TextureProps = any> extends TgpuNamable {
  readonly [$internal]: TextureInternals;
  readonly resourceType: 'texture';
  readonly props: TProps; // <- storing to be able to differentiate structurally between different textures.
  readonly destroyed: boolean;

  // Extensions
  readonly usableAsStorage: boolean;
  readonly usableAsSampled: boolean;
  readonly usableAsRender: boolean;

  $usage<T extends AllowedUsages<TProps>[]>(
    ...usages: T
  ): this & UnionToIntersection<LiteralToExtensionMap[T[number]]>;
  $overrideFlags(flags: GPUTextureUsageFlags): this & StorageFlag & SampledFlag & RenderFlag;

  createView(
    ...args: this['usableAsSampled'] extends true
      ? []
      : [ValidateTextureViewSchema<this, WgslTexture>]
  ): TgpuTextureView<DefaultViewSchema<TProps>>;
  createView(schema: 'render', viewDescriptor?: TgpuTextureViewDescriptor): TgpuTextureRenderView;
  createView<T extends WgslTexture>(
    schema: ValidateTextureViewSchema<this, T>,
    viewDescriptor?: TgpuTextureViewDescriptor & {
      sampleType?: T['sampleType'] extends F32 ? 'float' | 'unfilterable-float' : never;
    },
  ): TgpuTextureView<T>;
  createView<T extends WgslStorageTexture>(
    schema: ValidateTextureViewSchema<this, T>,
    viewDescriptor?: TgpuTextureViewDescriptor,
  ): TgpuTextureView<T>;

  /** Clears the texture to zeros */
  clear(mipLevel?: number | 'all'): void;
  /** Clears the texture to `color`. Requires the `'render'` usage flag */
  clear(color: readonly [number, number, number, number], mipLevel?: number | 'all'): void;
  generateMipmaps(baseMipLevel?: number, mipLevels?: number): void;
  /** Writes image sources to the texture, one per array layer. Requires the `'render'` usage flag */
  write(
    source: GPUCopyExternalImageSource | GPUCopyExternalImageSource[],
    options?: TextureWriteOptions,
  ): void;
  /** Writes raw texel data to the texture */
  write(
    source: ArrayBuffer | TypedArray | DataView,
    options?: number | TextureRawWriteOptions,
  ): void;
  /** Decodes an image blob and writes it to the texture. Requires the `'render'` usage flag */
  writeAsync(source: Blob, options?: TextureBlobWriteOptions): Promise<void>;
  // TODO: support copies from GPUBuffers and TgpuBuffers
  /** Copies the contents of a texture with a matching size and format */
  copyFrom<T extends CopyCompatibleTexture<TProps>>(source: T): void;
  /** Copies a region between textures of the same format */
  copyFrom<T extends FormatCompatibleTexture<TProps>>(source: T, options: TextureCopyOptions): void;

  destroy(): void;
}

export interface TgpuTextureView<
  TSchema extends WgslStorageTexture | WgslTexture = WgslStorageTexture | WgslTexture,
> extends TgpuNamable {
  readonly [$internal]: TextureViewInternals;
  readonly resourceType: 'texture-view';
  readonly schema: TSchema;
  readonly size?: number[] | undefined;

  readonly [$gpuValueOf]: Infer<TSchema>;
  $: Infer<TSchema>;

  toString(): string;
}

export interface TgpuTextureRenderView {
  readonly [$internal]: TextureViewInternals;
  readonly resourceType: 'texture-view';
  readonly descriptor: TgpuTextureViewDescriptor;
}

export function INTERNAL_createTexture(
  props: TextureProps,
  branch: ExperimentalTgpuRoot,
): TgpuTexture<TextureProps> {
  return new TgpuTextureImpl(props, branch);
}

export function isTexture(value: unknown): value is TgpuTexture {
  return (value as TgpuTexture)?.resourceType === 'texture' && !!(value as TgpuTexture)[$internal];
}

export function isTextureView(value: unknown): value is TgpuTextureView {
  return (
    (value as TgpuTextureView)?.resourceType === 'texture-view' &&
    !!(value as TgpuTextureView)[$internal]
  );
}

// --------------
// Implementation
// --------------

class TgpuTextureImpl<TProps extends TextureProps> implements TgpuTexture<TProps> {
  readonly [$internal]: TextureInternals;
  readonly resourceType = 'texture';
  readonly props: TProps;
  usableAsSampled = false;
  usableAsStorage = false;
  usableAsRender = false;

  #formatInfo: TextureFormatInfo;
  #destroyed = false;
  #flags = GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC;
  #flagsOverridden = false;
  #texture: GPUTexture | null = null;
  #branch: ExperimentalTgpuRoot;

  constructor(props: TProps, branch: ExperimentalTgpuRoot) {
    this.props = props;

    const format = props.format as TProps['format'];

    this.#branch = branch;
    this.#formatInfo = getTextureFormatInfo(format);

    this[$internal] = {
      device: branch.device,
      unwrap: () => {
        if (this.#destroyed) {
          throw new Error('This texture has been destroyed');
        }

        if (!this.#texture) {
          this.#texture = branch.device.createTexture({
            label: getName(this) ?? '<unnamed>',
            format: props.format,
            // The WebGPU types accept only mutable arrays, which is too loosely typed
            size: props.size as number[],
            usage: this.#flags,
            dimension: props.dimension ?? '2d',
            viewFormats: props.viewFormats ?? [],
            mipLevelCount: props.mipLevelCount ?? 1,
            sampleCount: props.sampleCount ?? 1,
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

  $usage<T extends ('sampled' | 'storage' | 'render' | 'transient')[]>(
    ...usages: T
  ): this & UnionToIntersection<LiteralToExtensionMap[T[number]]> {
    if (this.#flagsOverridden) {
      throw new Error('Cannot call $usage() after $overrideFlags().');
    }

    const hasStorage = usages.includes('storage');
    const hasSampled = usages.includes('sampled');
    const hasRender = usages.includes('render');
    const hasTransient = usages.includes('transient');

    const bindingFlags =
      (hasSampled ? GPUTextureUsage.TEXTURE_BINDING : 0) |
      (hasStorage ? GPUTextureUsage.STORAGE_BINDING : 0);
    const transientFlags = GPUTextureUsage.TRANSIENT_ATTACHMENT | GPUTextureUsage.RENDER_ATTACHMENT;
    const nextFlags =
      this.#flags | bindingFlags | (hasRender ? GPUTextureUsage.RENDER_ATTACHMENT : 0);

    const hasTransientUsage =
      hasTransient || !!(this.#flags & GPUTextureUsage.TRANSIENT_ATTACHMENT);
    const hasSampledOrStorageUsage = !!(
      nextFlags &
      (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING)
    );

    if (hasTransientUsage && hasSampledOrStorageUsage) {
      throw new Error("Transient texture usage cannot be combined with 'sampled' or 'storage'.");
    }

    this.#flags = hasTransient ? transientFlags : nextFlags;
    this.usableAsStorage ||= hasStorage;
    this.usableAsSampled ||= hasSampled;
    this.usableAsRender ||= hasRender || hasTransient;

    return this as this & UnionToIntersection<LiteralToExtensionMap[T[number]]>;
  }

  $overrideFlags(flags: GPUTextureUsageFlags): this & StorageFlag & SampledFlag & RenderFlag {
    this.#flags = flags;
    this.#flagsOverridden = true;
    this.usableAsSampled = true;
    this.usableAsStorage = true;
    this.usableAsRender = true;
    return this as this & StorageFlag & SampledFlag & RenderFlag;
  }

  createView(
    ...args: this['usableAsSampled'] extends true ? [] : [never]
  ): TgpuTextureView<DefaultViewSchema<TProps>>;
  createView(schema: 'render', viewDescriptor?: TgpuTextureViewDescriptor): TgpuTextureRenderView;
  createView<T extends WgslTexture>(
    schema: T,
    viewDescriptor?: TgpuTextureViewDescriptor & {
      sampleType?: T['sampleType'] extends F32 ? 'float' | 'unfilterable-float' : never;
    },
  ): TgpuTextureView<T>;
  createView<T extends WgslStorageTexture>(
    schema: T,
    viewDescriptor?: TgpuTextureViewDescriptor,
  ): TgpuTextureView<T>;
  createView<T extends WgslTexture | WgslStorageTexture>(
    schema?: T | 'render',
    viewDescriptor?: TgpuTextureViewDescriptor & {
      sampleType?: T extends WgslTexture ? 'float' | 'unfilterable-float' : never;
    },
  ): TgpuTextureView<T> | TgpuTextureRenderView {
    if (schema === 'render') {
      return new TgpuTextureRenderViewImpl(this as TgpuTexture, viewDescriptor);
    }

    return new TgpuFixedTextureViewImpl(
      schema ?? (textureDescriptorToSchema(getDescriptorForProps(this.props)) as T),
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

    const texelSize = this.#formatInfo.texelSize;
    if (texelSize === 'non-copyable') {
      throw new Error(
        `Cannot clear texture with format '${this.props.format}': this format does not support copy operations.`,
      );
    }

    this.#branch.device.queue.writeTexture(
      { texture: this[$internal].unwrap(), mipLevel: mip },
      new Uint8Array(width * height * depth * texelSize),
      { bytesPerRow: texelSize * width, rowsPerImage: height },
      [width, height, depth],
    );
  }

  clear(mipLevel?: number | 'all'): void;
  clear(color: readonly [number, number, number, number], mipLevel?: number | 'all'): void;
  clear(
    colorOrMipLevel: number | 'all' | readonly [number, number, number, number] = 'all',
    mipLevel: number | 'all' = 'all',
  ) {
    if (typeof colorOrMipLevel !== 'number' && colorOrMipLevel !== 'all') {
      this.#clearWithColor(colorOrMipLevel, mipLevel);
      return;
    }

    if (colorOrMipLevel === 'all') {
      const mipLevels = this.props.mipLevelCount ?? 1;
      for (let i = 0; i < mipLevels; i++) {
        this.#clearMipLevel(i);
      }
    } else {
      this.#clearMipLevel(colorOrMipLevel);
    }
  }

  #clearWithColor(color: readonly [number, number, number, number], mipLevel: number | 'all') {
    if (!this.usableAsRender) {
      throw new Error(
        "texture.clear(color) requires 'render' usage. Add it via the $usage('render') method.",
      );
    }

    if ((this.props.dimension ?? '2d') !== '2d') {
      throw new Error('Color clears only support 2D textures.');
    }

    const mipLevels =
      mipLevel === 'all'
        ? Array.from({ length: this.props.mipLevelCount ?? 1 }, (_, i) => i)
        : [mipLevel];

    clearTextureWithColor(this.#branch.device, this[$internal].unwrap(), color, mipLevels);
  }

  generateMipmaps(baseMipLevel = 0, mipLevels?: number) {
    if (!this.usableAsRender) {
      throw new Error(
        "generateMipmaps called without specifying 'render' usage. Add it via the $usage('render') method.",
      );
    }

    const actualMipLevels = mipLevels ?? (this.props.mipLevelCount ?? 1) - baseMipLevel;

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

  write(
    source: GPUCopyExternalImageSource | GPUCopyExternalImageSource[],
    options?: TextureWriteOptions,
  ): void;
  write(
    source: ArrayBuffer | TypedArray | DataView,
    options?: number | TextureRawWriteOptions,
  ): void;
  write(
    source:
      | GPUCopyExternalImageSource
      | GPUCopyExternalImageSource[]
      | ArrayBuffer
      | TypedArray
      | DataView,
    optionsOrMipLevel: TextureWriteOptions | TextureRawWriteOptions | number = 0,
  ) {
    if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
      this.#writeBufferData(
        source,
        typeof optionsOrMipLevel === 'number'
          ? { mipLevel: optionsOrMipLevel }
          : (optionsOrMipLevel as TextureRawWriteOptions),
      );
      return;
    }

    const options =
      typeof optionsOrMipLevel === 'number' ? {} : (optionsOrMipLevel as TextureWriteOptions);
    const sources = Array.isArray(source) ? source : [source];
    const layerCount = this.props.size[2] ?? 1;
    const baseLayer = options.origin?.[2] ?? 0;

    if (baseLayer + sources.length > layerCount) {
      console.warn(
        `Too many image sources provided. Expected ${layerCount} layers, got ${
          baseLayer + sources.length
        }. Extra sources will be ignored.`,
      );
    }

    const writes: TextureImageWrite[] = [];
    for (let layer = 0; layer < Math.min(sources.length, layerCount - baseLayer); layer++) {
      const image = sources[layer];
      if (image) {
        writes.push(imageWriteForLayer(image, this.props.size, baseLayer + layer, options));
      }
    }

    this.#writeImages(writes);
  }

  async writeAsync(source: Blob, options?: TextureBlobWriteOptions): Promise<void> {
    const write = { ...options, size: options?.size ?? textureLayerSize(this.props.size) };
    const bitmap = await createBitmapForBlobWrite(source, write);
    const { resize: _resize, ...imageOptions } = write;

    try {
      this.#writeImages([{ ...imageOptions, source: bitmap, resize: false }]);
    } finally {
      bitmap.close();
    }
  }

  #writeBufferData(source: ArrayBuffer | TypedArray | DataView, options: TextureRawWriteOptions) {
    const texelSize = this.#formatInfo.texelSize;
    if (texelSize === 'non-copyable') {
      throw new Error(
        `Cannot write to texture with format '${this.props.format}': this format does not support copy operations.`,
      );
    }

    const mipLevel = options.mipLevel ?? 0;
    const [mipWidth, mipHeight, mipDepth] = mipLevelSize(
      this.props.size,
      mipLevel,
      this.props.dimension ?? '2d',
    );
    const origin = {
      x: options.origin?.[0] ?? 0,
      y: options.origin?.[1] ?? 0,
      z: options.origin?.[2] ?? 0,
    };
    const width = options.size?.[0] ?? mipWidth - origin.x;
    const height = options.size?.[1] ?? mipHeight - origin.y;
    const depth = options.size?.[2] ?? mipDepth - origin.z;

    const expectedSize = width * height * depth * texelSize;

    if (source.byteLength !== expectedSize) {
      throw new Error(
        `Buffer size mismatch. Expected ${expectedSize} bytes for mip level ${mipLevel}, got ${source.byteLength} bytes.`,
      );
    }

    this.#branch.device.queue.writeTexture(
      {
        texture: this[$internal].unwrap(),
        mipLevel,
        origin,
      },
      source as GPUAllowSharedBufferSource,
      {
        bytesPerRow: texelSize * width,
        rowsPerImage: height,
      },
      [width, height, depth],
    );
  }

  #writeImages(writes: readonly TextureImageWrite[]) {
    if (!this.usableAsRender) {
      throw new Error(
        "texture.write(...) with image sources requires 'render' usage. Add it via the $usage('render') method.",
      );
    }

    const resamples: TextureImageWriteLayout[] = [];

    for (const write of writes) {
      const normalized = normalizeImageWrite(write);

      if (!needsResize(normalized)) {
        copyImageToTexture(this.#branch.device, this[$internal].unwrap(), normalized);
        continue;
      }

      validateResizeAllowed(write, normalized);
      resamples.push(normalized);
    }

    resampleImages(this.#branch.device, this[$internal].unwrap(), resamples);
  }

  copyFrom(source: FormatCompatibleTexture<TProps>, options?: TextureCopyOptions) {
    if (source.props.format !== this.props.format) {
      throw new Error(
        `Texture format mismatch. Source texture has format ${source.props.format}, target texture has format ${this.props.format}`,
      );
    }
    if (
      !options &&
      (source.props.size[0] !== this.props.size[0] ||
        (source.props.size[1] ?? 1) !== (this.props.size[1] ?? 1) ||
        (source.props.size[2] ?? 1) !== (this.props.size[2] ?? 1))
    ) {
      throw new Error(
        `Texture size mismatch. Source texture has size ${source.props.size.join(
          'x',
        )}, target texture has size ${this.props.size.join('x')}. Pass copy options to copy a region.`,
      );
    }

    const sourceMipLevel = options?.sourceMipLevel ?? 0;
    const sourceOrigin = {
      x: options?.sourceOrigin?.[0] ?? 0,
      y: options?.sourceOrigin?.[1] ?? 0,
      z: options?.sourceOrigin?.[2] ?? 0,
    };
    const [sourceWidth, sourceHeight, sourceDepth] = mipLevelSize(
      source.props.size,
      sourceMipLevel,
      source.props.dimension ?? '2d',
    );

    const commandEncoder = this.#branch.device.createCommandEncoder();
    commandEncoder.copyTextureToTexture(
      { texture: source[$internal].unwrap(), mipLevel: sourceMipLevel, origin: sourceOrigin },
      {
        texture: this[$internal].unwrap(),
        mipLevel: options?.mipLevel ?? 0,
        origin: {
          x: options?.origin?.[0] ?? 0,
          y: options?.origin?.[1] ?? 0,
          z: options?.origin?.[2] ?? 0,
        },
      },
      [
        options?.size?.[0] ?? sourceWidth - sourceOrigin.x,
        options?.size?.[1] ?? sourceHeight - sourceOrigin.y,
        options?.size?.[2] ?? sourceDepth - sourceOrigin.z,
      ],
    );
    this.#branch.device.queue.submit([commandEncoder.finish()]);
  }

  toString(): string {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
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
  implements TgpuTextureView<T>, SelfResolvable, TgpuNamable
{
  /** Type-token, not available at runtime */
  declare readonly [$repr]: Infer<T>;
  readonly [$internal]: TextureViewInternals;
  readonly resourceType = 'texture-view' as const;
  readonly schema: T;

  #baseTexture: TgpuTexture;
  #view: GPUTextureView | undefined;
  #descriptor:
    | (TgpuTextureViewDescriptor & {
        sampleType?: T extends WgslTexture ? 'float' | 'unfilterable-float' : never;
      })
    | undefined;

  constructor(schema: T, baseTexture: TgpuTexture, descriptor?: TgpuTextureViewDescriptor) {
    this.schema = schema;
    this.#baseTexture = baseTexture;
    this.#descriptor = descriptor;

    this[$internal] = {
      unwrap: () => {
        if (!this.#view) {
          const schema = this.schema;
          const format = isWgslStorageTexture(schema)
            ? schema.format
            : this.#baseTexture.props.format;

          this.#view = this.#baseTexture[$internal].unwrap().createView({
            ...this.#descriptor,
            label: getName(this) ?? '<unnamed>',
            format: this.#descriptor?.format ?? format,
            dimension: schema.dimension,
          });
        }
        return this.#view;
      },
    };
  }

  $name(label: string) {
    setName(this, label);
    if (this.#view) {
      this.#view.label = label;
    }
    return this;
  }

  get [$gpuValueOf](): Infer<T> {
    const schema = this.schema;

    return new Proxy(
      {
        [$internal]: true,
        get [$ownSnippet]() {
          return snip(this, schema, /* origin */ 'handle', false);
        },
        [$resolve]: (ctx) => ctx.resolve(this),
        toString: () => `${this.toString()}.$`,
      },
      valueProxyHandler,
    ) as unknown as Infer<T>;
  }

  get $(): Infer<T> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
    }

    throw new Error(
      'Direct access to texture view values is possible only as part of a compute dispatch or draw call. Try .read() or .write() instead',
    );
  }

  get size(): number[] {
    return this.#baseTexture.props.size;
  }

  toString() {
    return `textureView:${getName(this) ?? '<unnamed>'}`;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.makeUniqueIdentifier(getName(this), 'global');
    const { group, binding } = ctx.allocateFixedEntry(
      isWgslStorageTexture(this.schema)
        ? {
            storageTexture: this.schema,
          }
        : {
            texture: this.schema,
            sampleType: this.#descriptor?.sampleType ?? this.schema.bindingSampleType[0],
          },
      this,
    );

    return ctx.gen.declareGlobalVar({
      group,
      binding,
      id,
      dataType: this.schema,
      scope: 'handle',
      init: undefined,
    });
  }
}

export class TgpuLaidOutTextureViewImpl<T extends WgslTexture | WgslStorageTexture>
  implements TgpuTextureView<T>, SelfResolvable
{
  /** Type-token, not available at runtime */
  declare readonly [$repr]: Infer<T>;
  readonly [$internal] = { unwrap: undefined };
  readonly resourceType = 'texture-view' as const;
  readonly #membership: LayoutMembership;
  readonly schema: T;

  constructor(schema: T, membership: LayoutMembership) {
    this.schema = schema;
    this.#membership = membership;
    setName(this, membership.key);
  }

  toString() {
    return `textureView:${getName(this) ?? '<unnamed>'}`;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.makeUniqueIdentifier(getName(this), 'global');
    const group = ctx.allocateLayoutEntry(this.#membership.layout);

    ctx.addDeclaration(
      `@group(${group}) @binding(${this.#membership.idx}) var ${id}: ${
        ctx.resolve(this.schema).value
      };`,
      id,
    );

    return snip(id, this.schema, /* origin */ 'handle');
  }

  get [$gpuValueOf](): Infer<T> {
    const schema = this.schema;
    return new Proxy(
      {
        [$internal]: true,
        get [$ownSnippet]() {
          return snip(this, schema, /* origin */ 'handle', false);
        },
        [$resolve]: (ctx) => ctx.resolve(this),
        toString: () => `${this.toString()}.$`,
      },
      valueProxyHandler,
    ) as unknown as Infer<T>;
  }

  get $(): Infer<T> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
    }

    throw new Error(
      `Accessed view '${
        getName(this) ?? '<unnamed>'
      }' outside of codegen mode. Direct access to texture views values is possible only as part of a compute dispatch or draw call. Try .read() or .write() instead`,
    );
  }

  $name(label: string): this {
    setName(this, label);
    return this;
  }
}

export class TgpuTextureRenderViewImpl implements TgpuTextureRenderView {
  readonly [$internal]: TextureViewInternals;
  readonly resourceType = 'texture-view' as const;
  readonly descriptor: TgpuTextureViewDescriptor;

  constructor(baseTexture: TgpuTexture, descriptor: TgpuTextureViewDescriptor = {}) {
    this.descriptor = descriptor;
    this[$internal] = {
      unwrap: () => {
        return baseTexture[$internal].unwrap().createView({
          label: getName(this) ?? '<unnamed>',
          ...this.descriptor,
        });
      },
    };
  }
}
