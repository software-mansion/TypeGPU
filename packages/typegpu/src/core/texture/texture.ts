import {
  isWgslStorageTexture,
  textureDescriptorToSchema,
  type TextureSchemaForDescriptor,
  type WgslStorageTexture,
  type WgslTexture,
  type WgslTextureProps,
} from '../../data/texture.ts';
import { inCodegenMode } from '../../execMode.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import type { Vec4f, Vec4i, Vec4u } from '../../data/wgslTypes.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { Infer, ValidateTextureViewSchema } from '../../shared/repr.ts';
import type {
  TextureFormatInfo,
  ViewDimensionToDimension,
} from './textureFormats.ts';
import {
  $gpuValueOf,
  $internal,
  $ownSnippet,
  $repr,
  $resolve,
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
import { type TextureFormats, textureFormats } from './textureFormats.ts';
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
    sampleType: T['format'] extends keyof TextureFormats
      ? TextureFormats[T['format']]['channelType']
      : TextureFormats[keyof TextureFormats]['channelType'];
    multisampled: Default<T['sampleCount'], 1> extends 1 ? false : true;
  }>;

type BaseDimension<T extends string> = T extends keyof ViewDimensionToDimension
  ? ViewDimensionToDimension[T]
  : never;

type OptionalDimension<T extends string> = T extends
  | '2d'
  | '2d-array'
  | 'cube'
  | 'cube-array' ? { dimension?: BaseDimension<T> }
  : { dimension: BaseDimension<T> };

type MultisampledProps<T extends WgslTexture> = T['multisampled'] extends true
  ? OptionalDimension<T['dimension']> & { sampleCount: 4 }
  : OptionalDimension<T['dimension']> & { sampleCount?: 1 };

export type PropsForSchema<T extends WgslTexture | WgslStorageTexture> =
  T extends WgslTexture ? {
      size: readonly number[];
      format: GPUTextureFormat;
    } & MultisampledProps<T>
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
    sampleType: textureFormats[props.format].channelType,
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
  GPUTextureFormat extends T ? TextureAspect[]
    : T extends DepthStencilFormats ? ('depth' | 'stencil')[]
    : T extends DepthFormats ? 'depth'[]
    : T extends StencilFormats ? 'stencil'[]
    : 'color'[];

function getAspectsForFormat<T extends GPUTextureFormat>(
  format: T,
): AspectsForFormat<T> {
  if (format === 'depth24plus-stencil8' || format === 'depth32float-stencil8') {
    return ['depth', 'stencil'] as AspectsForFormat<T>;
  }
  if (
    format === 'depth16unorm' ||
    format === 'depth24plus' ||
    format === 'depth32float'
  ) {
    return ['depth'] as AspectsForFormat<T>;
  }
  if (format === 'stencil8') {
    return ['stencil'] as AspectsForFormat<T>;
  }
  return ['color'] as AspectsForFormat<T>;
}

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
  readonly aspects: AspectsForFormat<TProps['format']>;
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
  write(source: ExternalImageSource | ExternalImageSource[]): void;
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

  readonly [$gpuValueOf]: Infer<TSchema>;
  value: Infer<TSchema>;
  $: Infer<TSchema>;
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
  readonly aspects: AspectsForFormat<this['props']['format']>;
  usableAsSampled = false;
  usableAsStorage = false;
  usableAsRender = false;

  #formatInfo: TextureFormatInfo;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: wdym, it is used 10 lines below
  #byteSize: number;
  #destroyed = false;
  #flags = GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC;
  #texture: GPUTexture | null = null;
  #branch: ExperimentalTgpuRoot;

  constructor(
    public readonly props: TProps,
    branch: ExperimentalTgpuRoot,
  ) {
    const format = props.format as TProps['format'];

    this.#branch = branch;
    this.#formatInfo = textureFormats[format];
    this.#byteSize = (props.size[0] as number) *
      (props.size[1] ?? 1) *
      (props.size[2] ?? 1) *
      this.#formatInfo.texelSize;
    this.aspects = getAspectsForFormat(format);

    this[$internal] = {
      unwrap: () => {
        if (this.#destroyed) {
          throw new Error('This texture has been destroyed');
        }

        if (!this.#texture) {
          this.#texture = branch.device.createTexture({
            label: getName(this) ?? '<unnamed>',
            format: props.format,
            size: props.size,
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
    if (this.usableAsRender === false) {
      throw new Error(
        "generateMipmaps called without specifying 'render' usage. Add it via the $usage('render') method.",
      );
    }

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
    if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
      this.#writeBufferData(source, mipLevel);
      return;
    }

    const dimension = this.props.dimension ?? '2d';
    const isArray = Array.isArray(source);

    if (!isArray) {
      this.#writeSingleLayer(source, dimension === '3d' ? 0 : undefined);
      return;
    }

    const layerCount = this.props.size[2] ?? 1;
    if (source.length > layerCount) {
      console.warn(
        `Too many image sources provided. Expected ${layerCount} layers, got ${source.length}. Extra sources will be ignored.`,
      );
    }

    for (let layer = 0; layer < Math.min(source.length, layerCount); layer++) {
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
          source.props.size.join(
            'x',
          )
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
  implements TgpuTextureView<T>, SelfResolvable, TgpuNamable {
  /** Type-token, not available at runtime */
  declare readonly [$repr]: Infer<T>;
  readonly [$internal]: TextureViewInternals;
  readonly resourceType = 'texture-view' as const;

  #baseTexture: TgpuTexture;
  #view: GPUTextureView | undefined;
  #descriptor:
    | (TgpuTextureViewDescriptor & {
      sampleType?: T extends WgslTexture ? 'float' | 'unfilterable-float'
        : never;
    })
    | undefined;

  constructor(
    readonly schema: T,
    baseTexture: TgpuTexture,
    descriptor?: TgpuTextureViewDescriptor,
  ) {
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
          return snip(this, schema);
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

  get value(): Infer<T> {
    return this.$;
  }

  toString() {
    return `textureView:${getName(this) ?? '<unnamed>'}`;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.getUniqueName(this);
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
        ctx.resolve(this.schema).value
      };`,
    );

    return snip(id, this.schema);
  }
}

export class TgpuLaidOutTextureViewImpl<
  T extends WgslTexture | WgslStorageTexture,
> implements TgpuTextureView<T>, SelfResolvable {
  /** Type-token, not available at runtime */
  declare readonly [$repr]: Infer<T>;
  readonly [$internal] = { unwrap: undefined };
  readonly resourceType = 'texture-view' as const;
  readonly #membership: LayoutMembership;

  constructor(
    readonly schema: T,
    membership: LayoutMembership,
  ) {
    this.#membership = membership;
    setName(this, membership.key);
  }

  toString() {
    return `textureView:${getName(this) ?? '<unnamed>'}`;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.getUniqueName(this);
    const group = ctx.allocateLayoutEntry(this.#membership.layout);

    ctx.addDeclaration(
      `@group(${group}) @binding(${this.#membership.idx}) var ${id}: ${
        ctx.resolve(this.schema).value
      };`,
    );

    return snip(id, this.schema);
  }

  get [$gpuValueOf](): Infer<T> {
    const schema = this.schema;
    return new Proxy(
      {
        [$internal]: true,
        get [$ownSnippet]() {
          return snip(this, schema);
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
      'Direct access to texture views values is possible only as part of a compute dispatch or draw call. Try .read() or .write() instead',
    );
  }

  get value(): Infer<T> {
    return this.$;
  }
}
