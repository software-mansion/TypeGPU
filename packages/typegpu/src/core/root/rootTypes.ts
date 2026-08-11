import type { AnyComputeBuiltin, AnyFragmentInputBuiltin, OmitBuiltins } from '../../builtin.ts';
import type { TgpuQuerySet } from '../querySet/querySet.ts';
import type { AnyData } from '../../data/dataTypes.ts';
import type { InstanceToSchema } from '../../data/instanceToSchema.ts';
import type { WgslComparisonSamplerProps, WgslSamplerProps } from '../../data/sampler.ts';
import type { AnyWgslData, BaseData, v3u, v4f, Vec3u, Void } from '../../data/wgslTypes.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import type { TgpuSoul } from '../../shared/soul.ts';
import type {
  ExtractInvalidSchemaError,
  InferGPURecord,
  InferInput,
  IsValidBufferSchema,
  IsValidStorageSchema,
  IsValidUniformSchema,
} from '../../shared/repr.ts';
import { $internal, $soul } from '../../shared/symbols.ts';
import type { Assume, Mutable, OmitProps, Prettify } from '../../shared/utilityTypes.ts';
import type {
  ExtractBindGroupInputFromLayout,
  TgpuBindGroup,
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout.ts';
import type { LogGeneratorOptions } from '../../tgsl/consoleLog/types.ts';
import type { ShaderGeneratorClass } from '../../tgsl/shaderGenerator.ts';
import type { Unwrapper } from '../../unwrapper.ts';
import type { TgpuBuffer } from '../buffer/buffer.ts';
import type { TgpuMutable, TgpuReadonly, TgpuUniform } from '../buffer/bufferBinding.ts';
import type {
  AnyAutoCustoms,
  AutoFragmentIn,
  AutoFragmentOut,
  AutoVertexIn,
  AutoVertexOut,
} from '../function/autoIO.ts';
import type { IORecord } from '../function/fnTypes.ts';
import type { TgpuFragmentFn, VertexOutToVarying } from '../function/tgpuFragmentFn.ts';
import type { TgpuVertexFn } from '../function/tgpuVertexFn.ts';
import type { TgpuCommandEncoder } from '../commandEncoder/commandEncoder.ts';
import type { TgpuRenderBundleEncoder } from '../commandEncoder/renderPass.ts';
import type { TgpuComputePipeline } from '../pipeline/computePipeline.ts';
import type { FragmentOutToTargets, TgpuRenderPipeline } from '../pipeline/renderPipeline.ts';
import type { TgpuFixedComparisonSampler, TgpuFixedSampler } from '../sampler/sampler.ts';
import type { Eventual, TgpuAccessor, TgpuMutableAccessor, TgpuSlot } from '../slot/slotTypes.ts';
import type { TgpuTexture } from '../texture/texture.ts';
import type {
  AttribRecordToDefaultDataTypes,
  LayoutToAllowedAttribs,
} from '../vertexLayout/vertexAttribute.ts';

// ----------
// Public API
// ----------

export interface TgpuRootSoul extends TgpuSoul<'root'> {
  readonly device: GPUDevice;
  readonly nameRegistrySetting: 'random' | 'strict';
  readonly logOptions: LogGeneratorOptions;
  readonly minify: boolean;
  readonly nonTransferablePriors?: string[] | undefined;
}

export interface TgpuGuardedComputePipelineSoul extends TgpuSoul<'guarded-compute-pipeline'> {
  readonly device: GPUDevice;
  readonly pipeline: TgpuComputePipeline;
  readonly sizeUniform: TgpuUniform<Vec3u>;
  readonly workgroupSize: v3u;
}

export interface TgpuGuardedComputePipeline<TArgs extends number[] = number[]> extends TgpuNamable {
  readonly resourceType: 'guarded-compute-pipeline';
  readonly [$soul]: TgpuGuardedComputePipelineSoul;
  /**
   * Returns a pipeline wrapper with the specified bind group bound.
   * Analogous to `TgpuComputePipeline.with(bindGroup)`.
   */
  with(bindGroup: TgpuBindGroup): TgpuGuardedComputePipeline<TArgs>;

  /**
   * Returns a pipeline wrapper with the given performance callback attached.
   * Analogous to `TgpuComputePipeline.withPerformanceCallback(callback)`.
   */
  withPerformanceCallback(
    callback: (start: bigint, end: bigint) => void | Promise<void>,
  ): TgpuGuardedComputePipeline<TArgs>;

  /**
   * Returns a pipeline wrapper with the given timestamp writes configuration.
   * Analogous to `TgpuComputePipeline.withTimestampWrites(options)`.
   */
  withTimestampWrites(options: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  }): TgpuGuardedComputePipeline<TArgs>;

  /**
   * Dispatches the pipeline.
   * Unlike `TgpuComputePipeline.dispatchWorkgroups()`, this method takes in the
   * number of threads to run in each dimension.
   *
   * Under the hood, the number of expected threads is sent as a uniform, and
   * "guarded" by a bounds check.
   */
  dispatchThreads(...args: TArgs): void;

  /**
   * Immediately resolves the pipeline, then awaits `device.createComputePipelineAsync()`.
   * NOTE: it is not necessary to initialize pipelines manually.
   */
  initAsync(): Promise<void>;

  /**
   * Immediately resolves the pipeline and creates WebGPU resources.
   * NOTE: it is not necessary to initialize pipelines manually.
   */
  initSync(): void;

  /**
   * The underlying pipeline used during `dispatchThreads`.
   */
  pipeline: TgpuComputePipeline;

  /**
   * The buffer used to automatically pass the thread count to the underlying pipeline during `dispatchThreads`.
   * For pipelines with a dimension count lower than 3, the remaining coordinates are expected to be 1.
   */
  sizeUniform: TgpuUniform<Vec3u>;
}

export interface Withable<TSelf> {
  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): TSelf;
  with<T extends BaseData>(accessor: TgpuAccessor<T>, value: TgpuAccessor.In<NoInfer<T>>): TSelf;
  with<T extends BaseData>(
    accessor: TgpuMutableAccessor<T>,
    value: TgpuMutableAccessor.In<NoInfer<T>>,
  ): TSelf;
}

export interface Withable_Deprecated<TSelf> {
  /**
   * @deprecated This feature is stable, remove the `['~unstable']`
   * @param slot
   * @param value
   */
  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): TSelf;
  /**
   * @deprecated This feature is stable, remove the `['~unstable']`
   * @param slot
   * @param value
   */
  with<T extends BaseData>(accessor: TgpuAccessor<T>, value: TgpuAccessor.In<NoInfer<T>>): TSelf;
  /**
   * @deprecated This feature is stable, remove the `['~unstable']`
   * @param slot
   * @param value
   */
  with<T extends BaseData>(
    accessor: TgpuMutableAccessor<T>,
    value: TgpuMutableAccessor.In<NoInfer<T>>,
  ): TSelf;
}

export interface Configurable extends Withable<Configurable> {
  readonly bindings: [slot: TgpuSlot<unknown>, value: unknown][];

  pipe(transform: (cfg: Configurable) => Configurable): Configurable;
}

/**
 * Gets rid of builtins, and turns instances into schemas
 * @example d.v4f => d.Vec4f
 * @example d.builtin.position => d.Void
 * @example { a: d.v4f, $fragDepth: number } => { a: d.Vec4f }
 */
type NormalizeOutput<T> = T extends { readonly [$internal]: unknown } | number | boolean
  ? [OmitBuiltins<InstanceToSchema<T>>] extends [never]
    ? Void
    : OmitBuiltins<InstanceToSchema<T>>
  : { [K in keyof OmitBuiltins<T>]: InstanceToSchema<OmitBuiltins<T>[K]> };

export interface WithBinding extends Withable<WithBinding> {
  createComputePipeline<ComputeIn extends IORecord<AnyComputeBuiltin>>(
    descriptor: TgpuComputePipeline.Descriptor<ComputeIn>,
  ): TgpuComputePipeline;

  createRenderPipeline<
    // oxlint-disable-next-line typescript/no-explicit-any -- if the shelled entry function is not provided, the default lets TAttribs be inferred
    TVertexIn extends TgpuVertexFn.In = Record<string, any>,
    TAttribs extends LayoutToAllowedAttribs<TVertexIn> = LayoutToAllowedAttribs<TVertexIn>,
    TVertexOut = unknown,
    TFragmentOut = unknown,
  >(
    descriptor: TgpuRenderPipeline.DescriptorBase & {
      attribs?: TAttribs;
      vertex:
        | TgpuVertexFn<TVertexIn, Assume<TVertexOut, TgpuVertexFn.Out>>
        | ((
            input: AutoVertexIn<
              Assume<InferGPURecord<AttribRecordToDefaultDataTypes<TAttribs>>, AnyAutoCustoms>
            >,
          ) => AutoVertexOut<Assume<TVertexOut, AnyAutoCustoms>>);
      fragment:
        | TgpuFragmentFn<
            VertexOutToVarying<TVertexOut> & Record<string, AnyFragmentInputBuiltin>,
            Assume<TFragmentOut, TgpuFragmentFn.Out>
          >
        | ((
            input: AutoFragmentIn<
              Assume<InferGPURecord<VertexOutToVarying<TVertexOut>>, AnyAutoCustoms>
            >,
          ) => AutoFragmentOut<Assume<TFragmentOut, AnyAutoCustoms | v4f>>);
      targets?: FragmentOutToTargets<NoInfer<TFragmentOut>>;
    },
  ): TgpuRenderPipeline<NormalizeOutput<TFragmentOut>>;
  createRenderPipeline<
    // oxlint-disable-next-line typescript/no-explicit-any -- if the shelled entry function is not provided, the default lets TAttribs be inferred
    TVertexIn extends TgpuVertexFn.In = Record<string, any>,
    TAttribs extends LayoutToAllowedAttribs<TVertexIn> = LayoutToAllowedAttribs<TVertexIn>,
    TVertexOut extends TgpuVertexFn.Out = TgpuVertexFn.Out,
  >(
    descriptor: TgpuRenderPipeline.DescriptorBase & {
      attribs?: TAttribs;
      vertex:
        | TgpuVertexFn<TVertexIn, Assume<TVertexOut, TgpuVertexFn.Out>>
        | ((
            input: AutoVertexIn<
              Assume<InferGPURecord<AttribRecordToDefaultDataTypes<TAttribs>>, AnyAutoCustoms>
            >,
          ) => AutoVertexOut<Assume<TVertexOut, AnyAutoCustoms>>);
      fragment?:
        | undefined
        | TgpuFragmentFn<
            VertexOutToVarying<OmitBuiltins<TVertexOut>> & Record<string, AnyFragmentInputBuiltin>,
            Record<string, never> | Void
          >
        | ((
            input: AutoFragmentIn<
              Assume<InferGPURecord<OmitBuiltins<NoInfer<TVertexOut>>>, AnyAutoCustoms>
            >,
          ) => AutoFragmentOut<undefined>);
      targets?: undefined;
    },
  ): TgpuRenderPipeline<Void>;
  createRenderPipeline<
    // oxlint-disable-next-line typescript/no-explicit-any -- if the shelled entry function is not provided, the default lets TAttribs be inferred
    TVertexIn extends TgpuVertexFn.In = Record<string, any>,
    TAttribs extends LayoutToAllowedAttribs<TVertexIn> = LayoutToAllowedAttribs<TVertexIn>,
    TVertexOut extends TgpuVertexFn.Out = TgpuVertexFn.Out,
    TFragmentOut = unknown,
  >(
    descriptor: TgpuRenderPipeline.DescriptorBase &
      (
        | {
            attribs?: TAttribs;
            vertex:
              | TgpuVertexFn<TVertexIn, Assume<TVertexOut, TgpuVertexFn.Out>>
              | ((
                  input: AutoVertexIn<
                    Assume<InferGPURecord<AttribRecordToDefaultDataTypes<TAttribs>>, AnyAutoCustoms>
                  >,
                ) => AutoVertexOut<Assume<TVertexOut, AnyAutoCustoms>>);
            fragment:
              | ((
                  input: AutoFragmentIn<
                    Assume<InferGPURecord<OmitBuiltins<NoInfer<TVertexOut>>>, AnyAutoCustoms>
                  >,
                ) => AutoFragmentOut<Assume<TFragmentOut, AnyAutoCustoms | v4f>>)
              | TgpuFragmentFn<
                  VertexOutToVarying<OmitBuiltins<TVertexOut>> &
                    Record<string, AnyFragmentInputBuiltin>,
                  Assume<TFragmentOut, TgpuFragmentFn.Out>
                >;
            targets?: FragmentOutToTargets<NoInfer<TFragmentOut>>;
          }
        | {
            attribs?: TAttribs;
            vertex:
              | TgpuVertexFn<TVertexIn, Assume<TVertexOut, TgpuVertexFn.Out>>
              | ((
                  input: AutoVertexIn<
                    Assume<InferGPURecord<AttribRecordToDefaultDataTypes<TAttribs>>, AnyAutoCustoms>
                  >,
                ) => AutoVertexOut<Assume<TVertexOut, AnyAutoCustoms>>);
            fragment?:
              | undefined
              | TgpuFragmentFn<
                  VertexOutToVarying<OmitBuiltins<TVertexOut>> &
                    Record<string, AnyFragmentInputBuiltin>,
                  Record<string, never>
                >
              | ((
                  input: AutoFragmentIn<
                    Assume<InferGPURecord<OmitBuiltins<NoInfer<TVertexOut>>>, AnyAutoCustoms>
                  >,
                ) => AutoFragmentOut<undefined>);
            targets?: undefined;
          }
      ),
  ): TgpuRenderPipeline<NormalizeOutput<TFragmentOut>> | TgpuRenderPipeline<Void>;

  /**
   * Creates a compute pipeline that executes the given callback in an exact number of threads.
   * This is different from `createComputePipeline()` in that it does a bounds check on the
   * thread id, where as regular pipelines do not and work in units of workgroups.
   *
   * @param callback A function converted to WGSL and executed on the GPU.
   *                 It can accept up to 3 parameters (x, y, z) which correspond to the global invocation ID
   *                 of the executing thread.
   *
   * @example
   * If no parameters are provided, the callback will be executed once, in a single thread.
   *
   * ```ts
   * const fooPipeline = root
   *   .createGuardedComputePipeline(() => {
   *     'use gpu';
   *     console.log('Hello, GPU!');
   *   });
   *
   * fooPipeline.dispatchThreads();
   * // [GPU] Hello, GPU!
   * ```
   *
   * @example
   * One parameter means n-threads will be executed in parallel.
   *
   * ```ts
   * const fooPipeline = root
   *   .createGuardedComputePipeline((x) => {
   *     'use gpu';
   *     if (x % 16 === 0) {
   *       // Logging every 16th thread
   *       console.log('I am the', x, 'thread');
   *     }
   *   });
   *
   * // executing 512 threads
   * fooPipeline.dispatchThreads(512);
   * // [GPU] I am the 256 thread
   * // [GPU] I am the 272 thread
   * // ... (30 hidden logs)
   * // [GPU] I am the 16 thread
   * // [GPU] I am the 240 thread
   * ```
   */
  createGuardedComputePipeline<TArgs extends number[]>(
    callback: (...args: TArgs) => void,
  ): TgpuGuardedComputePipeline<TArgs>;

  pipe(transform: (cfg: Configurable) => Configurable): WithBinding;
}

type SrgbVariants = {
  rgba8unorm: 'rgba8unorm-srgb';
  bgra8unorm: 'bgra8unorm-srgb';
  'bc1-rgba-unorm': 'bc1-rgba-unorm-srgb';
  'bc2-rgba-unorm': 'bc2-rgba-unorm-srgb';
  'bc3-rgba-unorm': 'bc3-rgba-unorm-srgb';
  'bc7-rgba-unorm': 'bc7-rgba-unorm-srgb';
  'etc2-rgb8unorm': 'etc2-rgb8unorm-srgb';
  'etc2-rgb8a1unorm': 'etc2-rgb8a1unorm-srgb';
  'etc2-rgba8unorm': 'etc2-rgba8unorm-srgb';
  'astc-4x4-unorm': 'astc-4x4-unorm-srgb';
  'astc-5x4-unorm': 'astc-5x4-unorm-srgb';
  'astc-5x5-unorm': 'astc-5x5-unorm-srgb';
  'astc-6x5-unorm': 'astc-6x5-unorm-srgb';
  'astc-6x6-unorm': 'astc-6x6-unorm-srgb';
  'astc-8x5-unorm': 'astc-8x5-unorm-srgb';
  'astc-8x6-unorm': 'astc-8x6-unorm-srgb';
  'astc-8x8-unorm': 'astc-8x8-unorm-srgb';
  'astc-10x5-unorm': 'astc-10x5-unorm-srgb';
  'astc-10x6-unorm': 'astc-10x6-unorm-srgb';
  'astc-10x8-unorm': 'astc-10x8-unorm-srgb';
  'astc-10x10-unorm': 'astc-10x10-unorm-srgb';
  'astc-12x10-unorm': 'astc-12x10-unorm-srgb';
  'astc-12x12-unorm': 'astc-12x12-unorm-srgb';
};

type SrgbVariantOrSelf<T extends GPUTextureFormat> = T extends keyof SrgbVariants
  ? (SrgbVariants[T] | T)[] | undefined
  : T extends `${infer Base}-srgb`
    ? Base extends keyof SrgbVariants
      ? (T | SrgbVariants[Base])[] | undefined
      : T[] | undefined
    : T[] | undefined;

export type CreateTextureOptions<
  TSize,
  TFormat extends GPUTextureFormat,
  TMipLevelCount extends number,
  TSampleCount extends number,
  TViewFormats extends GPUTextureFormat[],
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
  viewFormats?: TViewFormats extends SrgbVariantOrSelf<NoInfer<TFormat>>
    ? TViewFormats
    : SrgbVariantOrSelf<NoInfer<TFormat>>;
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
  TViewFormats extends GPUTextureFormat[],
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
      viewFormats: GPUTextureFormat[] extends TViewFormats
        ? // Omitted property means the default
          // '[]' is the default, omitting from type
          undefined
        : TViewFormats extends never[]
          ? undefined
          : // As per WebGPU spec, the only format that can appear here is the srgb variant of the texture format or the base format if the texture format is srgb (or self)
            TViewFormats extends SrgbVariantOrSelf<TFormat>
            ? TViewFormats
            : never;
    },
    undefined
  >
>;

export type ValidateBufferSchema<TData extends BaseData> =
  IsValidBufferSchema<TData> extends false ? ExtractInvalidSchemaError<TData, '(Error) '> : TData;

export type ValidateStorageSchema<TData extends BaseData> =
  IsValidStorageSchema<TData> extends false ? ExtractInvalidSchemaError<TData, '(Error) '> : TData;

export type ValidateUniformSchema<TData extends BaseData> =
  IsValidUniformSchema<TData> extends false ? ExtractInvalidSchemaError<TData, '(Error) '> : TData;

export type ConfigureContextOptions = {
  /**
   * The canvas for which a context will be created and configured.
   */
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /**
   * Passed to `context.configure()`.
   * Defaults to `navigator.gpu.getPreferredCanvasFormat()` if not provided.
   */
  format?: GPUTextureFormat;
} & Omit<GPUCanvasConfiguration, 'device' | 'format'>;

export interface TgpuRoot extends Unwrapper, WithBinding {
  readonly resourceType: 'root';
  readonly [$soul]: TgpuRootSoul;
  [$internal]: {
    logOptions: LogGeneratorOptions;
  };

  /**
   * The GPU device associated with this root.
   */
  readonly device: GPUDevice;

  /**
   * Creates and configures context for the provided canvas.
   * Automatically sets the format to `navigator.gpu.getPreferredCanvasFormat()` if not provided.
   * @throws An error if no context could be obtained
   */
  configureContext(options: ConfigureContextOptions): GPUCanvasContext;

  /**
   * Allocates memory on the GPU, allows passing data between host and shader.
   *
   * @remarks
   * Typed wrapper around a GPUBuffer.
   *
   * @param typeSchema The type of data that this buffer will hold.
   * @param initial Either initial value of the buffer, or an initializer to execute on the mapped buffer. (optional)
   */
  createBuffer<TData extends AnyData>(
    typeSchema: ValidateBufferSchema<TData>,
    // NoInfer is there to infer the schema type just based on the first parameter
    initial?: ((buffer: TgpuBuffer<NoInfer<TData>>) => void) | InferInput<NoInfer<TData>>,
  ): TgpuBuffer<TData>;

  // This is a separate overload so that LSP does not hint `destroy()` etc when initializing with a struct.
  /**
   * Allocates memory on the GPU, allows passing data between host and shader.
   *
   * @remarks
   * Typed wrapper around a GPUBuffer.
   *
   * @param typeSchema The type of data that this buffer will hold.
   * @param gpuBuffer A vanilla WebGPU buffer.
   */
  createBuffer<TData extends AnyData>(
    typeSchema: ValidateBufferSchema<TData>,
    gpuBuffer: GPUBuffer,
  ): TgpuBuffer<TData>;

  /**
   * Allocates memory on the GPU, allows passing data between host and shader.
   * Read-only on the GPU, optimized for small data. For a general-purpose buffer,
   * use {@link TgpuRoot.createBuffer}.
   *
   * @param typeSchema The type of data that this buffer will hold.
   * @param initial Either initial value of the buffer, or an initializer to execute on the mapped buffer. (optional)
   */
  createUniform<TData extends AnyWgslData>(
    typeSchema: ValidateUniformSchema<TData>,
    // NoInfer is there to infer the schema type just based on the first parameter
    initial?: ((buffer: TgpuBuffer<NoInfer<TData>>) => void) | InferInput<NoInfer<TData>>,
  ): TgpuUniform<TData>;

  // This is a separate overload so that LSP does not hint `destroy()` etc when initializing with a struct.
  /**
   * Allocates memory on the GPU, allows passing data between host and shader.
   * Read-only on the GPU, optimized for small data. For a general-purpose buffer,
   * use {@link TgpuRoot.createBuffer}.
   *
   * @param typeSchema The type of data that this buffer will hold.
   * @param gpuBuffer A vanilla WebGPU buffer.
   */
  createUniform<TData extends AnyWgslData>(
    typeSchema: ValidateUniformSchema<TData>,
    gpuBuffer: GPUBuffer,
  ): TgpuUniform<TData>;

  /**
   * Allocates memory on the GPU, allows passing data between host and shader.
   * Can be mutated in-place on the GPU. For a general-purpose buffer,
   * use {@link TgpuRoot.createBuffer}.
   *
   * @param typeSchema The type of data that this buffer will hold.
   * @param initial Either initial value of the buffer, or an initializer to execute on the mapped buffer. (optional)
   */
  createMutable<TData extends AnyWgslData>(
    typeSchema: ValidateStorageSchema<TData>,
    // NoInfer is there to infer the schema type just based on the first parameter
    initial?: ((buffer: TgpuBuffer<NoInfer<TData>>) => void) | InferInput<NoInfer<TData>>,
  ): TgpuMutable<TData>;

  // This is a separate overload so that LSP does not hint `destroy()` etc when initializing with a struct.
  /**
   * Allocates memory on the GPU, allows passing data between host and shader.
   * Can be mutated in-place on the GPU. For a general-purpose buffer,
   * use {@link TgpuRoot.createBuffer}.
   *
   * @param typeSchema The type of data that this buffer will hold.
   * @param gpuBuffer A vanilla WebGPU buffer.
   */
  createMutable<TData extends AnyWgslData>(
    typeSchema: ValidateStorageSchema<TData>,
    gpuBuffer: GPUBuffer,
  ): TgpuMutable<TData>;

  /**
   * Allocates memory on the GPU, allows passing data between host and shader.
   * Read-only on the GPU, optimized for large data. For a general-purpose buffer,
   * use {@link TgpuRoot.createBuffer}.
   *
   * @param typeSchema The type of data that this buffer will hold.
   * @param initial Either initial value of the buffer, or an initializer to execute on the mapped buffer. (optional)
   */
  createReadonly<TData extends AnyWgslData>(
    typeSchema: ValidateStorageSchema<TData>,
    // NoInfer is there to infer the schema type just based on the first parameter
    initial?: ((buffer: TgpuBuffer<NoInfer<TData>>) => void) | InferInput<NoInfer<TData>>,
  ): TgpuReadonly<TData>;

  // This is a separate overload so that LSP does not hint `destroy()` etc when initializing with a struct.
  /**
   * Allocates memory on the GPU, allows passing data between host and shader.
   * Read-only on the GPU, optimized for large data. For a general-purpose buffer,
   * use {@link TgpuRoot.createBuffer}.
   *
   * @param typeSchema The type of data that this buffer will hold.
   * @param gpuBuffer A vanilla WebGPU buffer.
   */
  createReadonly<TData extends AnyWgslData>(
    typeSchema: ValidateStorageSchema<TData>,
    gpuBuffer: GPUBuffer,
  ): TgpuReadonly<TData>;

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
    TViewFormats extends GPUTextureFormat[],
    TDimension extends GPUTextureDimension,
  >(
    props: CreateTextureOptions<
      TSize,
      TFormat,
      TMipLevelCount,
      TSampleCount,
      TViewFormats,
      TDimension
    >,
  ): TgpuTexture<
    CreateTextureResult<TSize, TFormat, TMipLevelCount, TSampleCount, TViewFormats, TDimension>
  >;

  createSampler(props: WgslSamplerProps): TgpuFixedSampler;

  createComparisonSampler(props: WgslComparisonSamplerProps): TgpuFixedComparisonSampler;

  /**
   * Creates a query set for collecting timestamps or occlusion queries.
   *
   * @remarks
   * Typed wrapper around a GPUQuerySet.
   *
   * @param type The type of queries to collect ('occlusion' or 'timestamp').
   * @param count The number of queries in the set.
   * @param rawQuerySet An optional pre-existing GPUQuerySet to use instead of creating a new one.
   */
  createQuerySet<T extends GPUQueryType>(
    type: T,
    count: number,
    rawQuerySet?: GPUQuerySet,
  ): TgpuQuerySet<T>;

  /**
   * Creates a group of resources that can be bound to a shader based on a specified layout.
   *
   * @remarks
   * Typed wrapper around a GPUBindGroup.
   *
   * @example
   * const fooLayout = tgpu.bindGroupLayout({
   *  foo: { uniform: d.vec3f },
   *  bar: { texture: d.texture2d(d.f32) },
   * });
   *
   * const fooBuffer = ...;
   * const barTexture = ...;
   *
   * const fooBindGroup = root.createBindGroup(fooLayout, {
   *  foo: fooBuffer,
   *  bar: barTexture,
   * });
   *
   * @param layout Layout describing the bind group to be created.
   * @param entries A record with values being the resources populating the bind group
   * and keys being their associated names, matching the layout keys.
   */
  createBindGroup<
    Entries extends Record<string, TgpuLayoutEntry | null> = Record<string, TgpuLayoutEntry | null>,
  >(
    layout: TgpuBindGroupLayout<Entries>,
    entries: ExtractBindGroupInputFromLayout<Entries>,
  ): TgpuBindGroup<Entries>;

  /**
   * Retrieves a read-only list of all enabled features of the GPU device.
   * @returns A set of strings representing the enabled features.
   */
  get enabledFeatures(): ReadonlySet<GPUFeatureName>;

  /**
   * Destroys all underlying resources (i.e. buffers...) created through this root object.
   * If the object is created via `tgpu.init` instead of `tgpu.initFromDevice`,
   * then the inner GPU device is destroyed as well.
   */
  destroy(): void;

  '~unstable': Pick<
    ExperimentalTgpuRoot,
    | 'createCommandEncoder'
    | 'createComparisonSampler'
    | 'createGuardedComputePipeline'
    | 'createRenderBundleEncoder'
    | 'createSampler'
    | 'createTexture'
    | 'flush'
    | 'nameRegistrySetting'
    | 'shaderGeneratorClass'
    | 'pipe'
    | 'with'
  >;
}

export interface ExperimentalTgpuRoot
  extends Omit<TgpuRoot, 'with'>, Withable_Deprecated<WithBinding> {
  readonly nameRegistrySetting: 'strict' | 'random';
  readonly minify: boolean;
  readonly shaderGeneratorClass?: ShaderGeneratorClass | undefined;

  /** @deprecated Use `root.createTexture` instead. */
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
    TViewFormats extends GPUTextureFormat[],
    TDimension extends GPUTextureDimension,
  >(
    props: CreateTextureOptions<
      TSize,
      TFormat,
      TMipLevelCount,
      TSampleCount,
      TViewFormats,
      TDimension
    >,
  ): TgpuTexture<
    CreateTextureResult<TSize, TFormat, TMipLevelCount, TSampleCount, TViewFormats, TDimension>
  >;

  /**
   * Creates a {@link TgpuCommandEncoder} for batching multiple render/compute
   * passes (and draws within them) into a single submission.
   *
   * @example
   * ```ts
   * const encoder = root['~unstable'].createCommandEncoder();
   * const pass = encoder.beginRenderPass({
   *   colorAttachments: [{ view: msaaTexture, resolveTarget: context }],
   * });
   * scenePipeline.with(pass).draw(vertexCount);
   * skyPipeline.with(pass).draw(3);
   * pass.end();
   * encoder.submit();
   * ```
   */
  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): TgpuCommandEncoder;

  /**
   * Creates a {@link TgpuRenderBundleEncoder} for recording draw commands into
   * a {@link GPURenderBundle}. Call `finish()` on the encoder to obtain the
   * bundle, replayable in a render pass via `pass.executeBundles`.
   *
   * The caller is responsible for ensuring that the `descriptor` (e.g.
   * `colorFormats`, `depthStencilFormat`) is compatible with the render pass
   * in which the bundle will be executed.
   *
   * @param descriptor - Describes the formats the bundle must be compatible with.
   *
   * @example
   * ```ts
   * const bundleEncoder = root['~unstable'].createRenderBundleEncoder({
   *   colorFormats: ['rgba8unorm'],
   * });
   * scenePipeline.with(bundleEncoder).draw(vertexCount);
   * const bundle = bundleEncoder.finish();
   * ```
   */
  createRenderBundleEncoder(descriptor: GPURenderBundleEncoderDescriptor): TgpuRenderBundleEncoder;

  /** @deprecated Use `root.createSampler` instead. */
  createSampler(props: WgslSamplerProps): TgpuFixedSampler;

  /** @deprecated Use `root.createComparisonSampler` instead. */
  createComparisonSampler(props: WgslComparisonSamplerProps): TgpuFixedComparisonSampler;

  /**
   * @deprecated Used to cause all commands enqueued by pipelines to be
   * submitted to the GPU, but now commands are immediately dispatched,
   * which makes this method unnecessary.
   */
  flush(): void;

  /** @deprecated This feature is now stable, use `root.createGuardedComputePipeline`. */
  createGuardedComputePipeline<TArgs extends number[]>(
    callback: (...args: TArgs) => void,
  ): TgpuGuardedComputePipeline<TArgs>;

  /** @deprecated This feature is now stable, use `root.pipe`. */
  pipe(transform: (cfg: Configurable) => Configurable): WithBinding;
}
