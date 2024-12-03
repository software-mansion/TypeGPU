import type { OmitBuiltins } from '../../builtin';
import type { AnyData } from '../../data/dataTypes';
import type { Vec4f } from '../../data/wgslTypes';
import type { JitTranspiler } from '../../jitTranspiler';
import type { NameRegistry } from '../../nameRegistry';
import type { PlumListener } from '../../plumStore';
import type { TgpuSettable } from '../../settableTrait';
import type { Infer } from '../../shared/repr';
import type { Mutable, OmitProps, Prettify } from '../../shared/utilityTypes';
import type {
  ExtractPlumValue,
  TgpuPlum,
  Unsubscribe,
} from '../../tgpuPlumTypes';
import type { TgpuSampler } from '../../tgpuSampler';
import type { Eventual, TgpuSlot } from '../../types';
import type { Unwrapper } from '../../unwrapper';
import type { TgpuBuffer } from '../buffer/buffer';
import type { IOLayout } from '../function/fnTypes';
import type { TgpuComputeFn } from '../function/tgpuComputeFn';
import type { TgpuFragmentFn } from '../function/tgpuFragmentFn';
import type { TgpuVertexFn } from '../function/tgpuVertexFn';
import type { TgpuComputePipeline } from '../pipeline/computePipeline';
import type {
  FragmentOutToTargets,
  TgpuRenderPipeline,
} from '../pipeline/renderPipeline';
import type { TgpuTexture } from '../texture/texture';
import type { LayoutToAllowedAttribs } from '../vertexLayout/vertexAttribute';

// ----------
// Public API
// ----------

export type SetPlumAction<T> = T | ((prev: T) => T);

export interface WithCompute {
  createPipeline(): TgpuComputePipeline;
}

export interface WithVertex<Varying extends IOLayout = IOLayout> {
  withFragment<FragmentIn extends Varying, Output extends IOLayout<Vec4f>>(
    entryFn: TgpuFragmentFn<FragmentIn, Output>,
    targets: FragmentOutToTargets<Output>,
  ): WithFragment<Output>;
}

export interface WithFragment<
  Output extends IOLayout<Vec4f> = IOLayout<Vec4f>,
> {
  withPrimitive(primitiveState: GPUPrimitiveState): WithFragment<Output>;
  createPipeline(): TgpuRenderPipeline<Output>;
}

export interface WithBinding {
  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): WithBinding;

  withCompute(entryFn: TgpuComputeFn): WithCompute;

  withVertex<Attribs extends IOLayout, Varying extends IOLayout>(
    entryFn: TgpuVertexFn<Attribs, Varying>,
    attribs: LayoutToAllowedAttribs<OmitBuiltins<Attribs>>,
  ): WithVertex<Varying>;
}

export type CreateTextureOptions<
  TSize,
  TFormat extends GPUTextureFormat,
  TMipLevelCount extends number,
  TSampleCount extends number,
  TViewFormat extends GPUTextureFormat,
  TDimension extends GPUTextureDimension,
> = {
  /**
   * The width, height, and depth or layer count of the texture.
   */
  size: TSize;
  /**
   * The format of the texture.
   */
  format: TFormat;
  /**
   * The number of mip levels the texture will contain.
   * @default 1
   */
  mipLevelCount?: TMipLevelCount | undefined;
  /**
   * The sample count of the texture. A sampleCount > 1 indicates a multisampled texture.
   * @default 1
   */
  sampleCount?: TSampleCount | undefined;
  /**
   * Specifies extra formats (in addition to the texture's actual format) that can be used
   * when creating views of this texture.
   * @default []
   */
  viewFormats?: TViewFormat[] | undefined;
  /**
   * Whether the texture is one-dimensional, an array of two-dimensional layers, or three-dimensional.
   * @default '2d'
   */
  dimension?: TDimension | undefined;
};

export type CreateTextureResult<
  TSize extends readonly number[],
  TFormat extends GPUTextureFormat,
  TMipLevelCount extends number,
  TSampleCount extends number,
  TViewFormat extends GPUTextureFormat,
  TDimension extends GPUTextureDimension,
> = Prettify<
  {
    size: Mutable<TSize>;
    format: TFormat;
  } & OmitProps<
    {
      dimension: GPUTextureDimension extends TDimension
        ? // Omitted property means the default
          undefined
        : // '2d' is the default, omitting from type
          TDimension extends '2d'
          ? undefined
          : TDimension;
      mipLevelCount: number extends TMipLevelCount
        ? // Omitted property means the default
          undefined
        : // '1' is the default, omitting from type
          TMipLevelCount extends 1
          ? undefined
          : TMipLevelCount;
      sampleCount: number extends TSampleCount
        ? // Omitted property means the default
          undefined
        : // '1' is the default, omitting from type
          TSampleCount extends 1
          ? undefined
          : TSampleCount;
      viewFormats: GPUTextureFormat extends TViewFormat
        ? // Omitted property means the default
          undefined
        : // 'never[]' is the default, omitting from type
          TViewFormat[] extends never[]
          ? undefined
          : TViewFormat[];
    },
    undefined
  >
>;

export interface TgpuRoot extends Unwrapper {
  /**
   * The GPU device associated with this root.
   */
  readonly device: GPUDevice;

  /**
   * @param typeSchema The type of data that this buffer will hold.
   * @param initial The initial value of the buffer. (optional)
   */
  createBuffer<TData extends AnyData>(
    typeSchema: TData,
    initial?: Infer<TData> | TgpuPlum<Infer<TData>> | undefined,
  ): TgpuBuffer<TData>;

  /**
   * @param typeSchema The type of data that this buffer will hold.
   * @param gpuBuffer A vanilla WebGPU buffer.
   */
  createBuffer<TData extends AnyData>(
    typeSchema: TData,
    gpuBuffer: GPUBuffer,
  ): TgpuBuffer<TData>;

  createTexture<
    TWidth extends number,
    THeight extends number,
    TDepth extends number,
    TSize extends
      | readonly [TWidth]
      | readonly [TWidth, THeight]
      | readonly [TWidth, THeight, TDepth],
    TFormat extends GPUTextureFormat,
    TMipLevelCount extends number,
    TSampleCount extends number,
    TViewFormat extends GPUTextureFormat,
    TDimension extends GPUTextureDimension,
  >(
    props: CreateTextureOptions<
      TSize,
      TFormat,
      TMipLevelCount,
      TSampleCount,
      TViewFormat,
      TDimension
    >,
  ): TgpuTexture<
    CreateTextureResult<
      TSize,
      TFormat,
      TMipLevelCount,
      TSampleCount,
      TViewFormat,
      TDimension
    >
  >;

  destroy(): void;
}

export interface ExperimentalTgpuRoot extends TgpuRoot, WithBinding {
  readonly jitTranspiler?: JitTranspiler | undefined;
  readonly nameRegistry: NameRegistry;
  /**
   * The current command encoder. This property will
   * hold the same value until `flush()` is called.
   */
  readonly commandEncoder: GPUCommandEncoder;

  readPlum<TPlum extends TgpuPlum>(plum: TPlum): ExtractPlumValue<TPlum>;

  setPlum<TPlum extends TgpuPlum & TgpuSettable>(
    plum: TPlum,
    value: SetPlumAction<ExtractPlumValue<TPlum>>,
  ): void;

  onPlumChange<TValue>(
    plum: TgpuPlum<TValue>,
    listener: PlumListener<TValue>,
  ): Unsubscribe;

  samplerFor(sampler: TgpuSampler): GPUSampler;

  /**
   * Causes all commands enqueued by pipelines to be
   * submitted to the GPU.
   */
  flush(): void;
}
