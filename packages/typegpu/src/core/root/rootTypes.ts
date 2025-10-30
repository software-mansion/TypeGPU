import type { AnyComputeBuiltin, OmitBuiltins } from '../../builtin.ts';
import type { TgpuQuerySet } from '../../core/querySet/querySet.ts';
import type {
  AnyData,
  Disarray,
  UndecorateRecord,
} from '../../data/dataTypes.ts';
import type {
  WgslComparisonSamplerProps,
  WgslSamplerProps,
} from '../../data/sampler.ts';
import type {
  AnyWgslData,
  U16,
  U32,
  Void,
  WgslArray,
} from '../../data/wgslTypes.ts';
import type {
  ExtractInvalidSchemaError,
  Infer,
  IsValidBufferSchema,
  IsValidStorageSchema,
  IsValidUniformSchema,
} from '../../shared/repr.ts';
import { $internal } from '../../shared/symbols.ts';
import type {
  Mutable,
  OmitProps,
  Prettify,
} from '../../shared/utilityTypes.ts';
import type {
  ExtractBindGroupInputFromLayout,
  TgpuBindGroup,
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout.ts';
import type { LogGeneratorOptions } from '../../tgsl/consoleLog/types.ts';
import type { ShaderGenerator } from '../../tgsl/shaderGenerator.ts';
import type { Unwrapper } from '../../unwrapper.ts';
import type { TgpuBuffer, VertexFlag } from '../buffer/buffer.ts';
import type {
  TgpuBufferShorthand,
  TgpuMutable,
  TgpuReadonly,
  TgpuUniform,
} from '../buffer/bufferShorthand.ts';
import type {
  TgpuFixedComparisonSampler,
  TgpuFixedSampler,
} from '../sampler/sampler.ts';
import type { TgpuBufferUsage } from '../buffer/bufferUsage.ts';
import type { IORecord } from '../function/fnTypes.ts';
import type { TgpuFn } from '../function/tgpuFn.ts';
import type {
  FragmentInConstrained,
  FragmentOutConstrained,
  TgpuFragmentFn,
} from '../function/tgpuFragmentFn.ts';
import type {
  TgpuVertexFn,
  VertexInConstrained,
  VertexOutConstrained,
} from '../function/tgpuVertexFn.ts';
import type { TgpuComputePipeline } from '../pipeline/computePipeline.ts';
import type {
  FragmentOutToTargets,
  TgpuRenderPipeline,
} from '../pipeline/renderPipeline.ts';
import type { Eventual, TgpuAccessor, TgpuSlot } from '../slot/slotTypes.ts';
import type { TgpuTexture, TgpuTextureView } from '../texture/texture.ts';
import type { LayoutToAllowedAttribs } from '../vertexLayout/vertexAttribute.ts';
import type { TgpuVertexLayout } from '../vertexLayout/vertexLayout.ts';
import type { TgpuComputeFn } from './../function/tgpuComputeFn.ts';
import type { WgslStorageTexture, WgslTexture } from '../../data/texture.ts';

// ----------
// Public API
// ----------

export interface TgpuGuardedComputePipeline<TArgs extends number[] = number[]> {
  /**
   * Returns a pipeline wrapper with the specified bind group bound.
   * Analogous to `TgpuComputePipeline.with(bindGroup)`.
   */
  with(bindGroup: TgpuBindGroup): TgpuGuardedComputePipeline<TArgs>;

  /**
   * Dispatches the pipeline.
   * Unlike `TgpuComputePipeline.dispatchWorkgroups()`, this method takes in the
   * number of threads to run in each dimension.
   *
   * Under the hood, the number of expected threads is sent as a uniform, and
   * "guarded" by a bounds check.
   */
  dispatchThreads(...args: TArgs): void;
}

export interface WithCompute {
  createPipeline(): TgpuComputePipeline;
}

export type ValidateFragmentIn<
  VertexOut extends VertexOutConstrained,
  FragmentIn extends FragmentInConstrained,
  FragmentOut extends FragmentOutConstrained,
> = UndecorateRecord<FragmentIn> extends Partial<UndecorateRecord<VertexOut>>
  ? UndecorateRecord<VertexOut> extends UndecorateRecord<FragmentIn> ? [
      entryFn: TgpuFragmentFn<FragmentIn, FragmentOut>,
      targets: FragmentOutToTargets<FragmentOut>,
    ]
  : [
    entryFn: 'n/a',
    targets: 'n/a',
    MissingFromVertexOutput: {
      [Key in Exclude<keyof FragmentIn, keyof VertexOut>]: FragmentIn[Key];
    },
  ]
  : [
    entryFn: 'n/a',
    targets: 'n/a',
    MismatchedVertexOutput: {
      [
        Key in
          & keyof FragmentIn
          & keyof VertexOut as FragmentIn[Key] extends VertexOut[Key] ? never
            : Key
      ]: [got: VertexOut[Key], expecting: FragmentIn[Key]];
    },
  ];

export interface WithVertex<
  VertexOut extends VertexOutConstrained = VertexOutConstrained,
> {
  withFragment<
    FragmentIn extends FragmentInConstrained,
    FragmentOut extends FragmentOutConstrained,
  >(
    ...args: ValidateFragmentIn<VertexOut, FragmentIn, FragmentOut>
  ): WithFragment<FragmentOut>;

  withPrimitive(
    primitiveState:
      | GPUPrimitiveState
      | Omit<GPUPrimitiveState, 'stripIndexFormat'> & {
        stripIndexFormat?: U32 | U16;
      }
      | undefined,
  ): WithFragment<Void>;

  withDepthStencil(
    depthStencilState: GPUDepthStencilState | undefined,
  ): WithFragment<Void>;

  withMultisample(
    multisampleState: GPUMultisampleState | undefined,
  ): WithFragment<Void>;

  createPipeline(): TgpuRenderPipeline<Void>;
}

export interface WithFragment<
  Output extends FragmentOutConstrained = FragmentOutConstrained,
> {
  withPrimitive(
    primitiveState:
      | GPUPrimitiveState
      | Omit<GPUPrimitiveState, 'stripIndexFormat'> & {
        stripIndexFormat?: U32 | U16;
      }
      | undefined,
  ): WithFragment<Output>;

  withDepthStencil(
    depthStencilState: GPUDepthStencilState | undefined,
  ): WithFragment<Output>;

  withMultisample(
    multisampleState: GPUMultisampleState | undefined,
  ): WithFragment<Output>;

  createPipeline(): TgpuRenderPipeline<Output>;
}

export interface Configurable {
  readonly bindings: [slot: TgpuSlot<unknown>, value: unknown][];

  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): Configurable;
  with<T extends WgslTexture | WgslStorageTexture>(
    accessor: TgpuAccessor<T>,
    value: TgpuTextureView<T> | Infer<T>,
  ): Configurable;
  with<T extends AnyWgslData>(
    accessor: TgpuAccessor<T>,
    value:
      | TgpuFn<() => T>
      | TgpuBufferUsage<T>
      | TgpuBufferShorthand<T>
      | Infer<T>,
  ): Configurable;

  pipe(transform: (cfg: Configurable) => Configurable): Configurable;
}

export interface WithBinding {
  withCompute<ComputeIn extends IORecord<AnyComputeBuiltin>>(
    entryFn: TgpuComputeFn<ComputeIn>,
  ): WithCompute;

  /**
   * Creates a compute pipeline that executes the given callback in an exact number of threads.
   * This is different from `withCompute(...).createPipeline()` in that it does a bounds check on the
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

  withVertex<
    VertexIn extends VertexInConstrained,
    VertexOut extends VertexOutConstrained,
  >(
    entryFn: TgpuVertexFn<VertexIn, VertexOut>,
    attribs: LayoutToAllowedAttribs<OmitBuiltins<VertexIn>>,
  ): WithVertex<VertexOut>;

  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): WithBinding;
  with<T extends WgslTexture | WgslStorageTexture>(
    accessor: TgpuAccessor<T>,
    value: TgpuTextureView<T> | Infer<T>,
  ): WithBinding;
  with<T extends AnyWgslData>(
    accessor: TgpuAccessor<T>,
    value:
      | TgpuFn<() => T>
      | TgpuBufferUsage<T>
      | TgpuBufferShorthand<T>
      | Infer<T>,
  ): WithBinding;

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

type SrgbVariantOrSelf<T extends GPUTextureFormat> = T extends
  keyof SrgbVariants ? (SrgbVariants[T] | T)[] | undefined
  : T extends `${infer Base}-srgb`
    ? Base extends keyof SrgbVariants ? (T | SrgbVariants[Base])[] | undefined
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
  & {
    size: Mutable<TSize>;
    format: TFormat;
  }
  & OmitProps<
    {
      dimension: GPUTextureDimension extends TDimension
        // Omitted property means the default
        ? undefined
        // '2d' is the default, omitting from type
        : TDimension extends '2d' ? undefined
        : TDimension;
      mipLevelCount: number extends TMipLevelCount
        // Omitted property means the default
        ? undefined
        // '1' is the default, omitting from type
        : TMipLevelCount extends 1 ? undefined
        : TMipLevelCount;
      sampleCount: number extends TSampleCount
        // Omitted property means the default
        ? undefined
        // '1' is the default, omitting from type
        : TSampleCount extends 1 ? undefined
        : TSampleCount;
      viewFormats: GPUTextureFormat[] extends TViewFormats
        // Omitted property means the default
        // '[]' is the default, omitting from type
        ? undefined
        : TViewFormats extends never[] ? undefined
        // As per WebGPU spec, the only format that can appear here is the srgb variant of the texture format or the base format if the texture format is srgb (or self)
        : TViewFormats extends SrgbVariantOrSelf<TFormat> ? TViewFormats
        : never;
    },
    undefined
  >
>;

export interface RenderPass {
  /**
   * Sets the viewport used during the rasterization stage to linearly map from
   * NDC (i.e., normalized device coordinates) to viewport coordinates.
   * @param x - Minimum X value of the viewport in pixels.
   * @param y - Minimum Y value of the viewport in pixels.
   * @param width - Width of the viewport in pixels.
   * @param height - Height of the viewport in pixels.
   * @param minDepth - Minimum depth value of the viewport.
   * @param maxDepth - Maximum depth value of the viewport.
   */
  setViewport(
    x: number,
    y: number,
    width: number,
    height: number,
    minDepth: number,
    maxDepth: number,
  ): void;

  /**
   * Sets the scissor rectangle used during the rasterization stage.
   * After transformation into viewport coordinates any fragments which fall outside the scissor
   * rectangle will be discarded.
   * @param x - Minimum X value of the scissor rectangle in pixels.
   * @param y - Minimum Y value of the scissor rectangle in pixels.
   * @param width - Width of the scissor rectangle in pixels.
   * @param height - Height of the scissor rectangle in pixels.
   */
  setScissorRect(x: number, y: number, width: number, height: number): void;

  /**
   * Sets the constant blend color and alpha values used with {@link GPUBlendFactor#constant}
   * and {@link GPUBlendFactor#"one-minus-constant"} {@link GPUBlendFactor}s.
   * @param color - The color to use when blending.
   */
  setBlendConstant(color: GPUColor): void;

  /**
   * Sets the {@link RenderState#[[stencilReference]]} value used during stencil tests with
   * the {@link GPUStencilOperation#"replace"} {@link GPUStencilOperation}.
   * @param reference - The new stencil reference value.
   */
  setStencilReference(reference: GPUStencilValue): undefined;

  /**
   * @param queryIndex - The index of the query in the query set.
   */
  beginOcclusionQuery(queryIndex: GPUSize32): undefined;

  endOcclusionQuery(): undefined;

  /**
   * Executes the commands previously recorded into the given {@link GPURenderBundle}s as part of
   * this render pass.
   * When a {@link GPURenderBundle} is executed, it does not inherit the render pass's pipeline, bind
   * groups, or vertex and index buffers. After a {@link GPURenderBundle} has executed, the render
   * pass's pipeline, bind group, and vertex/index buffer state is cleared
   * (to the initial, empty values).
   * Note: The state is cleared, not restored to the previous state.
   * This occurs even if zero {@link GPURenderBundle|GPURenderBundles} are executed.
   * @param bundles - List of render bundles to execute.
   */
  executeBundles(bundles: Iterable<GPURenderBundle>): undefined;

  setPipeline(pipeline: TgpuRenderPipeline): void;

  /**
   * Sets the current index buffer.
   * @param buffer - Buffer containing index data to use for subsequent drawing commands.
   * @param indexFormat - Format of the index data contained in `buffer`.
   * @param offset - Offset in bytes into `buffer` where the index data begins. Defaults to `0`.
   * @param size - Size in bytes of the index data in `buffer`.
   * 	             Defaults to the size of the buffer minus the offset.
   */
  setIndexBuffer<TData extends WgslArray | Disarray>(
    // TODO: Allow only typed buffers marked with Index usage
    buffer: TgpuBuffer<TData> | GPUBuffer,
    indexFormat: GPUIndexFormat,
    offset?: GPUSize64,
    size?: GPUSize64,
  ): void;

  setVertexBuffer<TData extends WgslArray | Disarray>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: (TgpuBuffer<TData> & VertexFlag) | GPUBuffer,
    offset?: GPUSize64,
    size?: GPUSize64,
  ): void;

  setBindGroup<Entries extends Record<string, TgpuLayoutEntry | null>>(
    bindGroupLayout: TgpuBindGroupLayout<Entries>,
    bindGroup: TgpuBindGroup<Entries> | GPUBindGroup,
  ): void;

  /**
   * Draws primitives.
   * @param vertexCount - The number of vertices to draw.
   * @param instanceCount - The number of instances to draw.
   * @param firstVertex - Offset into the vertex buffers, in vertices, to begin drawing from.
   * @param firstInstance - First instance to draw.
   */
  draw(
    vertexCount: number,
    instanceCount?: number | undefined,
    firstVertex?: number | undefined,
    firstInstance?: number | undefined,
  ): void;
  /**
   * Draws indexed primitives.
   * @param indexCount - The number of indices to draw.
   * @param instanceCount - The number of instances to draw.
   * @param firstIndex - Offset into the index buffer, in indices, begin drawing from.
   * @param baseVertex - Added to each index value before indexing into the vertex buffers.
   * @param firstInstance - First instance to draw.
   */
  drawIndexed(
    indexCount: number,
    instanceCount?: number | undefined,
    firstIndex?: number | undefined,
    baseVertex?: number | undefined,
    firstInstance?: number | undefined,
  ): void;
  /**
   * Draws primitives using parameters read from a {@link GPUBuffer}.
   * Packed block of **four 32-bit unsigned integer values (16 bytes total)**, given in the same
   * order as the arguments for {@link GPURenderEncoderBase#draw}. For example:
   * @param indirectBuffer - Buffer containing the indirect draw parameters.
   * @param indirectOffset - Offset in bytes into `indirectBuffer` where the drawing data begins.
   */
  drawIndirect(indirectBuffer: GPUBuffer, indirectOffset: GPUSize64): undefined;
  /**
   * Draws indexed primitives using parameters read from a {@link GPUBuffer}.
   * Tightly packed block of **five 32-bit unsigned integer values (20 bytes total)**, given in
   * the same order as the arguments for {@link GPURenderEncoderBase#drawIndexed}. For example:
   * @param indirectBuffer - Buffer containing the indirect drawIndexed parameters.
   * @param indirectOffset - Offset in bytes into `indirectBuffer` where the drawing data begins.
   */
  drawIndexedIndirect(
    indirectBuffer: GPUBuffer,
    indirectOffset: GPUSize64,
  ): undefined;
}

export type ValidateBufferSchema<TData extends AnyData> =
  IsValidBufferSchema<TData> extends false
    ? ExtractInvalidSchemaError<TData, '(Error) '>
    : TData;

export type ValidateStorageSchema<TData extends AnyData> =
  IsValidStorageSchema<TData> extends false
    ? ExtractInvalidSchemaError<TData, '(Error) '>
    : TData;

export type ValidateUniformSchema<TData extends AnyData> =
  IsValidUniformSchema<TData> extends false
    ? ExtractInvalidSchemaError<TData, '(Error) '>
    : TData;

export interface TgpuRoot extends Unwrapper {
  [$internal]: {
    logOptions: LogGeneratorOptions;
  };

  /**
   * The GPU device associated with this root.
   */
  readonly device: GPUDevice;

  /**
   * Allocates memory on the GPU, allows passing data between host and shader.
   *
   * @remarks
   * Typed wrapper around a GPUBuffer.
   *
   * @param typeSchema The type of data that this buffer will hold.
   * @param initial The initial value of the buffer. (optional)
   */
  createBuffer<TData extends AnyData>(
    typeSchema: ValidateBufferSchema<TData>,
    // NoInfer is there to infer the schema type just based on the first parameter
    initial?: Infer<NoInfer<TData>> | undefined,
  ): TgpuBuffer<TData>;

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
   * @param initial The initial value of the buffer. (optional)
   */
  createUniform<TData extends AnyWgslData>(
    typeSchema: ValidateUniformSchema<TData>,
    // NoInfer is there to infer the schema type just based on the first parameter
    initial?: Infer<NoInfer<TData>>,
  ): TgpuUniform<TData>;

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
   * @param initial The initial value of the buffer. (optional)
   */
  createMutable<TData extends AnyWgslData>(
    typeSchema: ValidateStorageSchema<TData>,
    // NoInfer is there to infer the schema type just based on the first parameter
    initial?: Infer<NoInfer<TData>>,
  ): TgpuMutable<TData>;

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
   * @param initial The initial value of the buffer. (optional)
   */
  createReadonly<TData extends AnyWgslData>(
    typeSchema: ValidateStorageSchema<TData>,
    // NoInfer is there to infer the schema type just based on the first parameter
    initial?: Infer<NoInfer<TData>>,
  ): TgpuReadonly<TData>;

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
    rawQuerySet?: GPUQuerySet | undefined,
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
   *  bar: { texture: 'float' },
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
    Entries extends Record<string, TgpuLayoutEntry | null> = Record<
      string,
      TgpuLayoutEntry | null
    >,
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

  '~unstable': Omit<ExperimentalTgpuRoot, keyof TgpuRoot>;
}

export interface ExperimentalTgpuRoot extends TgpuRoot, WithBinding {
  readonly nameRegistrySetting: 'strict' | 'random';
  readonly shaderGenerator?:
    | ShaderGenerator
    | undefined;
  /**
   * The current command encoder. This property will
   * hold the same value until `flush()` is called.
   */
  readonly commandEncoder: GPUCommandEncoder;

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
    CreateTextureResult<
      TSize,
      TFormat,
      TMipLevelCount,
      TSampleCount,
      TViewFormats,
      TDimension
    >
  >;

  beginRenderPass(
    descriptor: GPURenderPassDescriptor,
    callback: (pass: RenderPass) => void,
  ): void;

  createSampler(props: WgslSamplerProps): TgpuFixedSampler;

  createComparisonSampler(
    props: WgslComparisonSamplerProps,
  ): TgpuFixedComparisonSampler;

  /**
   * Causes all commands enqueued by pipelines to be
   * submitted to the GPU.
   */
  flush(): void;
}
