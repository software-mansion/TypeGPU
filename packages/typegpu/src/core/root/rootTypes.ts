import type {
  AnyComputeBuiltin,
  AnyFragmentInputBuiltin,
  OmitBuiltins,
} from '../../builtin.ts';
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
  BaseData,
  U16,
  U32,
  v4f,
  Vec3u,
  Void,
  WgslArray,
} from '../../data/wgslTypes.ts';
import type {
  ExtractInvalidSchemaError,
  Infer,
  InferGPURecord,
  IsValidBufferSchema,
  IsValidStorageSchema,
  IsValidUniformSchema,
} from '../../shared/repr.ts';
import { $internal } from '../../shared/symbols.ts';
import type {
  Assume,
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
  TgpuMutable,
  TgpuReadonly,
  TgpuUniform,
} from '../buffer/bufferShorthand.ts';
import type {
  TgpuFixedComparisonSampler,
  TgpuFixedSampler,
} from '../sampler/sampler.ts';
import type { IORecord } from '../function/fnTypes.ts';
import type {
  FragmentInConstrained,
  FragmentOutConstrained,
  TgpuFragmentFn,
  VertexOutToVarying,
} from '../function/tgpuFragmentFn.ts';
import type { TgpuVertexFn } from '../function/tgpuVertexFn.ts';
import type { TgpuComputePipeline } from '../pipeline/computePipeline.ts';
import type {
  FragmentOutToTargets,
  TgpuRenderPipeline,
} from '../pipeline/renderPipeline.ts';
import type {
  Eventual,
  TgpuAccessor,
  TgpuMutableAccessor,
  TgpuSlot,
} from '../slot/slotTypes.ts';
import type { TgpuTexture } from '../texture/texture.ts';
import type {
  AttribRecordToDefaultDataTypes,
  LayoutToAllowedAttribs,
} from '../vertexLayout/vertexAttribute.ts';
import type { TgpuVertexLayout } from '../vertexLayout/vertexLayout.ts';
import type { TgpuComputeFn } from './../function/tgpuComputeFn.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import type {
  AnyAutoCustoms,
  AutoFragmentIn,
  AutoFragmentOut,
  AutoVertexIn,
  AutoVertexOut,
} from '../function/autoIO.ts';
import type { InstanceToSchema } from '../../data/instanceToSchema.ts';

// ----------
// Public API
// ----------

export interface TgpuGuardedComputePipeline<TArgs extends number[] = number[]>
  extends TgpuNamable {
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

export interface WithCompute {
  createPipeline(): TgpuComputePipeline;
}

type OptionalArgs<T> = T extends Record<string, never> | undefined ? [] | [T]
  : [T];

/**
 * TODO: Remove in favor of createRenderPipeline's validation
 */
export type ValidateFragmentIn<
  VertexOut extends TgpuVertexFn.Out,
  FragmentIn extends FragmentInConstrained,
  FragmentOut extends FragmentOutConstrained,
> = UndecorateRecord<FragmentIn> extends Partial<UndecorateRecord<VertexOut>>
  ? UndecorateRecord<VertexOut> extends UndecorateRecord<FragmentIn>
    ? OptionalArgs<FragmentOutToTargets<FragmentOut>> extends infer Args
      ? Args extends [infer T]
        ? [entryFn: TgpuFragmentFn<FragmentIn, FragmentOut>, targets: T]
      : Args extends [] | [infer T] ?
          | [entryFn: TgpuFragmentFn<FragmentIn, FragmentOut>]
          | [entryFn: TgpuFragmentFn<FragmentIn, FragmentOut>, targets: T]
      : never
    : never
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
  VertexOut extends TgpuVertexFn.Out = TgpuVertexFn.Out,
> {
  /**
   * @deprecated Use `root.createRenderPipeline` instead.
   */
  withFragment<
    FragmentIn extends FragmentInConstrained,
    FragmentOut extends FragmentOutConstrained,
  >(
    ...args: ValidateFragmentIn<VertexOut, FragmentIn, FragmentOut>
  ): WithFragment<FragmentOut>;

  /**
   * @deprecated Use `root.createRenderPipeline` instead.
   */
  withPrimitive(
    primitiveState:
      | GPUPrimitiveState
      | Omit<GPUPrimitiveState, 'stripIndexFormat'> & {
        stripIndexFormat?: U32 | U16;
      }
      | undefined,
  ): WithFragment<Void>;

  /**
   * @deprecated Use `root.createRenderPipeline` instead.
   */
  withDepthStencil(
    depthStencilState: GPUDepthStencilState | undefined,
  ): WithFragment<Void>;

  /**
   * @deprecated Use `root.createRenderPipeline` instead.
   */
  withMultisample(
    multisampleState: GPUMultisampleState | undefined,
  ): WithFragment<Void>;

  /**
   * @deprecated Use `root.createRenderPipeline` instead.
   */
  createPipeline(): TgpuRenderPipeline<Void>;
}

export interface WithFragment<
  Targets extends FragmentOutConstrained = FragmentOutConstrained,
> {
  withPrimitive(
    primitiveState:
      | GPUPrimitiveState
      | Omit<GPUPrimitiveState, 'stripIndexFormat'> & {
        stripIndexFormat?: U32 | U16;
      }
      | undefined,
  ): WithFragment<Targets>;

  withDepthStencil(
    depthStencilState: GPUDepthStencilState | undefined,
  ): WithFragment<Targets>;

  withMultisample(
    multisampleState: GPUMultisampleState | undefined,
  ): WithFragment<Targets>;

  createPipeline(): TgpuRenderPipeline<Targets>;
}

export interface Withable<TSelf> {
  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): TSelf;
  with<T extends BaseData>(
    accessor: TgpuAccessor<T>,
    value: TgpuAccessor.In<NoInfer<T>>,
  ): TSelf;
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
  with<T extends BaseData>(
    accessor: TgpuAccessor<T>,
    value: TgpuAccessor.In<NoInfer<T>>,
  ): TSelf;
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
type NormalizeOutput<T> = T extends
  { readonly [$internal]: unknown } | number | boolean
  ? [OmitBuiltins<InstanceToSchema<T>>] extends [never] ? Void
  : OmitBuiltins<InstanceToSchema<T>>
  : { [K in keyof OmitBuiltins<T>]: InstanceToSchema<OmitBuiltins<T>[K]> };

export interface WithBinding extends Withable<WithBinding> {
  /** @deprecated Use `root.createComputePipeline` instead. */
  withCompute<ComputeIn extends IORecord<AnyComputeBuiltin>>(
    entryFn: TgpuComputeFn<ComputeIn>,
  ): WithCompute;

  createComputePipeline<ComputeIn extends IORecord<AnyComputeBuiltin>>(
    descriptor: TgpuComputePipeline.Descriptor<ComputeIn>,
  ): TgpuComputePipeline;

  createRenderPipeline<
    // oxlint-disable-next-line typescript/no-explicit-any if the shelled entry function is not provided, the default lets TAttribs be inferred
    TVertexIn extends TgpuVertexFn.In = Record<string, any>,
    TAttribs extends LayoutToAllowedAttribs<TVertexIn> = LayoutToAllowedAttribs<
      TVertexIn
    >,
    TVertexOut = unknown,
    TFragmentOut = unknown,
  >(
    descriptor:
      & TgpuRenderPipeline.DescriptorBase
      & ({
        attribs?: TAttribs;
        vertex:
          | TgpuVertexFn<TVertexIn, Assume<TVertexOut, TgpuVertexFn.Out>>
          | ((
            input: AutoVertexIn<
              Assume<
                InferGPURecord<AttribRecordToDefaultDataTypes<TAttribs>>,
                AnyAutoCustoms
              >
            >,
          ) => AutoVertexOut<Assume<TVertexOut, AnyAutoCustoms>>);
        fragment:
          | TgpuFragmentFn<
            & VertexOutToVarying<TVertexOut>
            & Record<string, AnyFragmentInputBuiltin>,
            Assume<TFragmentOut, TgpuFragmentFn.Out>
          >
          | ((
            input: AutoFragmentIn<
              Assume<
                InferGPURecord<VertexOutToVarying<TVertexOut>>,
                AnyAutoCustoms
              >
            >,
          ) => AutoFragmentOut<Assume<TFragmentOut, AnyAutoCustoms | v4f>>);
        targets?: FragmentOutToTargets<NoInfer<TFragmentOut>>;
      }),
  ): TgpuRenderPipeline<NormalizeOutput<TFragmentOut>>;
  createRenderPipeline<
    // oxlint-disable-next-line typescript/no-explicit-any if the shelled entry function is not provided, the default lets TAttribs be inferred
    TVertexIn extends TgpuVertexFn.In = Record<string, any>,
    TAttribs extends LayoutToAllowedAttribs<TVertexIn> = LayoutToAllowedAttribs<
      TVertexIn
    >,
    TVertexOut extends TgpuVertexFn.Out = TgpuVertexFn.Out,
  >(
    descriptor:
      & TgpuRenderPipeline.DescriptorBase
      & {
        attribs?: TAttribs;
        vertex:
          | TgpuVertexFn<TVertexIn, Assume<TVertexOut, TgpuVertexFn.Out>>
          | ((
            input: AutoVertexIn<
              Assume<
                InferGPURecord<AttribRecordToDefaultDataTypes<TAttribs>>,
                AnyAutoCustoms
              >
            >,
          ) => AutoVertexOut<Assume<TVertexOut, AnyAutoCustoms>>);
        fragment?:
          | undefined
          | TgpuFragmentFn<
            & VertexOutToVarying<OmitBuiltins<TVertexOut>>
            & Record<string, AnyFragmentInputBuiltin>,
            Record<string, never> | Void
          >
          | ((
            input: AutoFragmentIn<
              Assume<
                InferGPURecord<OmitBuiltins<NoInfer<TVertexOut>>>,
                AnyAutoCustoms
              >
            >,
          ) => AutoFragmentOut<undefined>);
        targets?: undefined;
      },
  ): TgpuRenderPipeline<Void>;
  createRenderPipeline<
    // oxlint-disable-next-line typescript/no-explicit-any if the shelled entry function is not provided, the default lets TAttribs be inferred
    TVertexIn extends TgpuVertexFn.In = Record<string, any>,
    TAttribs extends LayoutToAllowedAttribs<TVertexIn> = LayoutToAllowedAttribs<
      TVertexIn
    >,
    TVertexOut extends TgpuVertexFn.Out = TgpuVertexFn.Out,
    TFragmentOut = unknown,
  >(
    descriptor:
      & TgpuRenderPipeline.DescriptorBase
      & (
        | {
          attribs?: TAttribs;
          vertex:
            | TgpuVertexFn<TVertexIn, Assume<TVertexOut, TgpuVertexFn.Out>>
            | ((
              input: AutoVertexIn<
                Assume<
                  InferGPURecord<AttribRecordToDefaultDataTypes<TAttribs>>,
                  AnyAutoCustoms
                >
              >,
            ) => AutoVertexOut<Assume<TVertexOut, AnyAutoCustoms>>);
          fragment:
            | ((
              input: AutoFragmentIn<
                Assume<
                  InferGPURecord<OmitBuiltins<NoInfer<TVertexOut>>>,
                  AnyAutoCustoms
                >
              >,
            ) => AutoFragmentOut<Assume<TFragmentOut, AnyAutoCustoms | v4f>>)
            | TgpuFragmentFn<
              & VertexOutToVarying<OmitBuiltins<TVertexOut>>
              & Record<string, AnyFragmentInputBuiltin>,
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
                Assume<
                  InferGPURecord<AttribRecordToDefaultDataTypes<TAttribs>>,
                  AnyAutoCustoms
                >
              >,
            ) => AutoVertexOut<Assume<TVertexOut, AnyAutoCustoms>>);
          fragment?:
            | undefined
            | TgpuFragmentFn<
              & VertexOutToVarying<OmitBuiltins<TVertexOut>>
              & Record<string, AnyFragmentInputBuiltin>,
              Record<string, never>
            >
            | ((
              input: AutoFragmentIn<
                Assume<
                  InferGPURecord<OmitBuiltins<NoInfer<TVertexOut>>>,
                  AnyAutoCustoms
                >
              >,
            ) => AutoFragmentOut<undefined>);
          targets?: undefined;
        }
      ),
  ):
    | TgpuRenderPipeline<NormalizeOutput<TFragmentOut>>
    | TgpuRenderPipeline<Void>;

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

  /**
   * @deprecated Use `root.createRenderPipeline` instead.
   */
  withVertex<
    VertexIn extends TgpuVertexFn.In,
    VertexOut extends TgpuVertexFn.Out,
  >(
    entryFn: TgpuVertexFn<VertexIn, VertexOut>,
    ...args: OptionalArgs<LayoutToAllowedAttribs<OmitBuiltins<VertexIn>>>
  ): WithVertex<VertexOut>;

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

export interface RenderBundleEncoderPass {
  /**
   * Sets the current {@link TgpuRenderPipeline} for subsequent draw calls.
   * @param pipeline - The render pipeline to use.
   */
  setPipeline(pipeline: TgpuRenderPipeline): void;

  /**
   * Sets the current index buffer.
   * @param buffer - Buffer containing index data to use for subsequent drawing commands.
   * @param indexFormat - Format of the index data contained in `buffer`.
   * @param offset - Offset in bytes into `buffer` where the index data begins. Defaults to `0`.
   * @param size - Size in bytes of the index data in `buffer`.
   *               Defaults to the size of the buffer minus the offset.
   */
  setIndexBuffer<TData extends WgslArray | Disarray>(
    buffer: TgpuBuffer<TData> | GPUBuffer,
    indexFormat: GPUIndexFormat,
    offset?: GPUSize64,
    size?: GPUSize64,
  ): void;

  /**
   * Binds a vertex buffer to the given vertex layout for subsequent draw calls.
   * @param vertexLayout - The vertex layout describing the buffer's structure.
   * @param buffer - The vertex buffer to bind.
   * @param offset - Offset in bytes into `buffer`. Defaults to `0`.
   * @param size - Size in bytes to bind. Defaults to the remainder of the buffer.
   */
  setVertexBuffer<TData extends WgslArray | Disarray>(
    vertexLayout: TgpuVertexLayout<TData>,
    buffer: (TgpuBuffer<TData> & VertexFlag) | GPUBuffer,
    offset?: GPUSize64,
    size?: GPUSize64,
  ): void;

  /**
   * Associates a bind group with the given layout for subsequent draw calls.
   * @param bindGroupLayout - The layout the bind group conforms to.
   * @param bindGroup - The bind group to associate.
   */
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
   * @param indirectBuffer - Buffer containing the indirect draw parameters.
   * @param indirectOffset - Offset in bytes into `indirectBuffer` where the drawing data begins.
   */
  drawIndirect(indirectBuffer: GPUBuffer, indirectOffset: GPUSize64): void;
  /**
   * Draws indexed primitives using parameters read from a {@link GPUBuffer}.
   * @param indirectBuffer - Buffer containing the indirect drawIndexed parameters.
   * @param indirectOffset - Offset in bytes into `indirectBuffer` where the drawing data begins.
   */
  drawIndexedIndirect(
    indirectBuffer: GPUBuffer,
    indirectOffset: GPUSize64,
  ): void;
}

export interface RenderPass extends RenderBundleEncoderPass {
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
  setStencilReference(reference: GPUStencilValue): void;

  /**
   * @param queryIndex - The index of the query in the query set.
   */
  beginOcclusionQuery(queryIndex: GPUSize32): void;

  endOcclusionQuery(): void;

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
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
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
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number,
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

export type ValidateBufferSchema<TData extends BaseData> =
  IsValidBufferSchema<TData> extends false
    ? ExtractInvalidSchemaError<TData, '(Error) '>
    : TData;

export type ValidateStorageSchema<TData extends BaseData> =
  IsValidStorageSchema<TData> extends false
    ? ExtractInvalidSchemaError<TData, '(Error) '>
    : TData;

export type ValidateUniformSchema<TData extends BaseData> =
  IsValidUniformSchema<TData> extends false
    ? ExtractInvalidSchemaError<TData, '(Error) '>
    : TData;

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
   * @param initial The initial value of the buffer. (optional)
   */
  createBuffer<TData extends AnyData>(
    typeSchema: ValidateBufferSchema<TData>,
    // NoInfer is there to infer the schema type just based on the first parameter
    initial?: Infer<NoInfer<TData>>,
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

  '~unstable': Pick<
    ExperimentalTgpuRoot,
    | 'beginRenderPass'
    | 'createComparisonSampler'
    | 'createGuardedComputePipeline'
    | 'createSampler'
    | 'createTexture'
    | 'flush'
    | 'nameRegistrySetting'
    | 'shaderGenerator'
    | 'pipe'
    | 'with'
    | 'withCompute'
    | 'withVertex'
  >;
}

export interface ExperimentalTgpuRoot
  extends Omit<TgpuRoot, 'with'>, Withable_Deprecated<WithBinding> {
  readonly nameRegistrySetting: 'strict' | 'random';
  readonly shaderGenerator?:
    | ShaderGenerator
    | undefined;

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

  /**
   * Creates a {@link GPURenderBundle} by recording draw commands into a
   * {@link GPURenderBundleEncoder}. The resulting bundle can be replayed in a
   * render pass via {@link RenderPass.executeBundles}.
   *
   * The caller is responsible for ensuring that the `descriptor` (e.g.
   * `colorFormats`, `depthStencilFormat`) is compatible with the render pass
   * in which the bundle will be executed.
   *
   * @param descriptor - Describes the formats the bundle must be compatible with.
   * @param callback - A function that records draw commands into the bundle.
   */
  beginRenderBundleEncoder(
    descriptor: GPURenderBundleEncoderDescriptor,
    callback: (pass: RenderBundleEncoderPass) => void,
  ): GPURenderBundle;

  createSampler(props: WgslSamplerProps): TgpuFixedSampler;

  createComparisonSampler(
    props: WgslComparisonSamplerProps,
  ): TgpuFixedComparisonSampler;

  /**
   * @deprecated Used to cause all commands enqueued by pipelines to be
   * submitted to the GPU, but now commands are immediately dispatched,
   * which makes this method unnecessary.
   */
  flush(): void;

  /** @deprecated Use `root.createComputePipeline` instead. */
  withCompute<ComputeIn extends IORecord<AnyComputeBuiltin>>(
    entryFn: TgpuComputeFn<ComputeIn>,
  ): WithCompute;

  /** @deprecated This feature is now stable, use `root.createGuardedComputePipeline`. */
  createGuardedComputePipeline<TArgs extends number[]>(
    callback: (...args: TArgs) => void,
  ): TgpuGuardedComputePipeline<TArgs>;

  /** @deprecated Use `root.createRenderPipeline` instead. */
  withVertex<
    VertexIn extends TgpuVertexFn.In,
    VertexOut extends TgpuVertexFn.Out,
  >(
    entryFn: TgpuVertexFn<VertexIn, VertexOut>,
    ...args: OptionalArgs<LayoutToAllowedAttribs<OmitBuiltins<VertexIn>>>
  ): WithVertex<VertexOut>;

  /** @deprecated This feature is now stable, use `root.pipe`. */
  pipe(transform: (cfg: Configurable) => Configurable): WithBinding;
}
