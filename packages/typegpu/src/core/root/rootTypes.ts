import type { AnyComputeBuiltin, OmitBuiltins } from '../../builtin.ts';
import type { TgpuQuerySet } from '../../core/querySet/querySet.ts';
import type { UndecorateRecord } from '../../data/attributes.ts';
import type { AnyData, Disarray, HasNestedType } from '../../data/dataTypes.ts';
import type { AnyWgslData, U16, U32, WgslArray } from '../../data/wgslTypes.ts';
import type { NameRegistry } from '../../nameRegistry.ts';
import type { Infer } from '../../shared/repr.ts';
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
import type { Unwrapper } from '../../unwrapper.ts';
import type { TgpuBuffer, VertexFlag } from '../buffer/buffer.ts';
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
import type { TgpuTexture } from '../texture/texture.ts';
import type { LayoutToAllowedAttribs } from '../vertexLayout/vertexAttribute.ts';
import type { TgpuVertexLayout } from '../vertexLayout/vertexLayout.ts';
import type { TgpuComputeFn } from './../function/tgpuComputeFn.ts';
import type {
  TgpuBufferShorthand,
  TgpuMutable,
  TgpuReadonly,
  TgpuUniform,
} from '../buffer/bufferShorthand.ts';

// ----------
// Public API
// ----------

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

  withVertex<
    VertexIn extends VertexInConstrained,
    VertexOut extends VertexOutConstrained,
  >(
    entryFn: TgpuVertexFn<VertexIn, VertexOut>,
    attribs: LayoutToAllowedAttribs<OmitBuiltins<VertexIn>>,
  ): WithVertex<VertexOut>;

  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): WithBinding;
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
      viewFormats: GPUTextureFormat extends TViewFormat
        // Omitted property means the default
        ? undefined
        // 'never[]' is the default, omitting from type
        : TViewFormat[] extends never[] ? undefined
        : TViewFormat[];
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

type ValidateSchema<TData extends AnyData> = HasNestedType<
  [TData],
  'bool'
> extends true ? 'Error: Bool is not host-shareable, use U32 or I32 instead'
  : HasNestedType<[TData], 'u16'> extends true ? TData extends {
      type: 'array';
      elementType: { type: 'u16' };
    } ? TData
    : 'Error: U16 is only usable inside arrays for index buffers'
  : TData;

export interface TgpuRoot extends Unwrapper {
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
    typeSchema: ValidateSchema<TData>,
    initial?: Infer<TData> | undefined,
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
    typeSchema: ValidateSchema<TData>,
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
    typeSchema: TData,
    initial?: Infer<TData>,
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
    typeSchema: TData,
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
    typeSchema: TData,
    initial?: Infer<TData>,
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
    typeSchema: TData,
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
    typeSchema: TData,
    initial?: Infer<TData>,
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
    typeSchema: TData,
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
  readonly nameRegistry: NameRegistry;
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

  beginRenderPass(
    descriptor: GPURenderPassDescriptor,
    callback: (pass: RenderPass) => void,
  ): void;

  /**
   * Causes all commands enqueued by pipelines to be
   * submitted to the GPU.
   */
  flush(): void;
}
