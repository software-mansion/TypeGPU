import type { Parsed } from 'typed-binary';

import type { TgpuArray } from '../../data/array';
import type { JitTranspiler } from '../../jitTranspiler';
import type { PlumListener } from '../../plumStore';
import type { TgpuSettable } from '../../settableTrait';
import type {
  ExtractPlumValue,
  TgpuPlum,
  Unsubscribe,
} from '../../tgpuPlumTypes';
import type { TgpuSampler } from '../../tgpuSampler';
import type { AnyTgpuData, TgpuData, Wgsl } from '../../types';
import type { Unwrapper } from '../../unwrapper';
import type { Mutable, OmitProps, Prettify } from '../../utilityTypes';
import type { TgpuBuffer } from '../buffer/buffer';
import type { TgpuExternalTexture } from '../texture/externalTexture';
import type { TgpuTexture } from '../texture/texture';

// ----------
// Public API
// ----------

export type SetPlumAction<T> = T | ((prev: T) => T);

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
  createBuffer<TData extends AnyTgpuData>(
    typeSchema: TData,
    initial?: Parsed<TData> | TgpuPlum<Parsed<TData>> | undefined,
  ): TgpuBuffer<TData>;

  /**
   * @param typeSchema The type of data that this buffer will hold.
   * @param gpuBuffer A vanilla WebGPU buffer.
   */
  createBuffer<TData extends AnyTgpuData>(
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

  importExternalTexture<TColorSpace extends PredefinedColorSpace>(options: {
    source: HTMLVideoElement | VideoFrame;
    /** @default 'srgb' */
    colorSpace?: TColorSpace;
  }): TgpuExternalTexture<{
    colorSpace: PredefinedColorSpace extends TColorSpace ? 'srgb' : TColorSpace;
  }>;

  destroy(): void;
}

export interface ExperimentalTgpuRoot extends TgpuRoot {
  readonly jitTranspiler?: JitTranspiler | undefined;
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

  makeRenderPipeline(options: RenderPipelineOptions): RenderPipelineExecutor;
  makeComputePipeline(options: ComputePipelineOptions): ComputePipelineExecutor;
}

export interface RenderPipelineOptions {
  vertex: {
    code: Wgsl;
    output: {
      [K in symbol]: string;
    } & {
      [K in string]: AnyTgpuData;
    };
  };
  fragment: {
    code: Wgsl;
    target: Iterable<GPUColorTargetState | null>;
  };
  primitive: GPUPrimitiveState;
  externalLayouts?: GPUBindGroupLayout[];
  label?: string;
}

export interface ComputePipelineOptions {
  code: Wgsl;
  workgroupSize?: readonly [number, number?, number?];
  externalLayouts?: GPUBindGroupLayout[];
  label?: string;
}

export type RenderPipelineExecutorOptions = GPURenderPassDescriptor & {
  vertexCount: number;
  instanceCount?: number;
  firstVertex?: number;
  firstInstance?: number;
  externalBindGroups?: GPUBindGroup[];
};

export interface RenderPipelineExecutor {
  execute(options: RenderPipelineExecutorOptions): void;
}

export type ComputePipelineExecutorOptions = {
  workgroups?: readonly [number, number?, number?];
  externalBindGroups?: GPUBindGroup[];
};

export interface ComputePipelineExecutor {
  execute(options?: ComputePipelineExecutorOptions): void;
}

const typeToVertexFormatMap: Record<string, GPUVertexFormat> = {
  f32: 'float32',
  vec2f: 'float32x2',
  vec3f: 'float32x3',
  vec4f: 'float32x4',
  u32: 'uint32',
  vec2u: 'uint32x2',
  vec3u: 'uint32x3',
  vec4u: 'uint32x4',
  i32: 'sint32',
  vec2i: 'sint32x2',
  vec3i: 'sint32x3',
  vec4i: 'sint32x4',
};

export function deriveVertexFormat<
  TData extends TgpuData<AnyTgpuData> | TgpuArray<AnyTgpuData>,
>(typeSchema: TData): GPUVertexFormat {
  if ('expressionCode' in typeSchema) {
    const code = typeSchema.expressionCode as string;
    const format = typeToVertexFormatMap[code];
    if (!format) {
      throw new Error(`Unsupported vertex format: ${code}`);
    }
    return format;
  }
  if ('elementType' in typeSchema) {
    return deriveVertexFormat(typeSchema.elementType as TData);
  }
  throw new Error('Invalid vertex format schema');
}
