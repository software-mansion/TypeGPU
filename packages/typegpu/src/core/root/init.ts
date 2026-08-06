import { type AnyComputeBuiltin, builtin } from '../../builtin.ts';
import { INTERNAL_createQuerySet, type TgpuQuerySet } from '../querySet/querySet.ts';
import type { AnyData } from '../../data/dataTypes.ts';
import type { AnyWgslData, BaseData, v3u, Vec3u } from '../../data/wgslTypes.ts';
import { WeakMemo } from '../../memo.ts';
import { clearTextureUtilsCache } from '../texture/textureUtils.ts';
import type { BufferInitialData } from '../buffer/buffer.ts';
import { $getNameForward, $internal, $soul } from '../../shared/symbols.ts';
import type {
  ExtractBindGroupInputFromLayout,
  TgpuBindGroup,
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout.ts';
import { isBindGroup, isBindGroupLayout, TgpuBindGroupImpl } from '../../tgpuBindGroupLayout.ts';
import type { LogGeneratorOptions } from '../../tgsl/consoleLog/types.ts';
import type { ShaderGenerator } from '../../tgsl/shaderGenerator.ts';
import { INTERNAL_createBuffer, type TgpuBuffer } from '../buffer/buffer.ts';
import {
  isBufferBinding,
  TgpuBufferBindingImpl,
  type TgpuBufferBinding,
  type TgpuMutable,
  type TgpuReadonly,
  type TgpuUniform,
} from '../buffer/bufferBinding.ts';
import { computeFn } from '../function/tgpuComputeFn.ts';
import { fn } from '../function/tgpuFn.ts';
import {
  INTERNAL_createComputePipeline,
  type TgpuComputePipeline,
} from '../pipeline/computePipeline.ts';
import {
  INTERNAL_createRenderPipeline,
  type TgpuRenderPipeline,
} from '../pipeline/renderPipeline.ts';
import {
  isTgpuCommandEncoder,
  isTgpuComputePass,
  isTgpuRenderCommands,
} from '../pipeline/typeGuards.ts';
import {
  INTERNAL_createCommandEncoder,
  type TgpuCommandEncoder,
} from '../commandEncoder/commandEncoder.ts';
import type { TgpuComputePass } from '../commandEncoder/computePass.ts';
import {
  INTERNAL_createRenderBundleEncoder,
  type TgpuRenderBundleEncoder,
  type TgpuRenderPass,
} from '../commandEncoder/renderPass.ts';
import {
  INTERNAL_createComparisonSampler,
  INTERNAL_createSampler,
  isComparisonSampler,
  isSampler,
  type TgpuComparisonSampler,
  type TgpuFixedComparisonSampler,
  type TgpuFixedSampler,
  type TgpuSampler,
} from '../sampler/sampler.ts';
import type { WgslComparisonSamplerProps, WgslSamplerProps } from '../../data/sampler.ts';
import {
  isAccessor,
  isMutableAccessor,
  type TgpuAccessor,
  type TgpuMutableAccessor,
  type TgpuSlot,
} from '../slot/slotTypes.ts';
import {
  INTERNAL_createTexture,
  isTextureView,
  type TgpuTexture,
  type TgpuTextureView,
} from '../texture/texture.ts';
import { isVertexLayout, type TgpuVertexLayout } from '../vertexLayout/vertexLayout.ts';
import { ConfigurableImpl } from './configurableImpl.ts';
import type {
  Configurable,
  ConfigureContextOptions,
  CreateTextureOptions,
  CreateTextureResult,
  ExperimentalTgpuRoot,
  TgpuGuardedComputePipeline,
  TgpuGuardedComputePipelineSoul,
  TgpuRootSoul,
  TgpuRoot,
  WithBinding,
} from './rootTypes.ts';
import { vec3f, vec3u } from '../../data/vector.ts';
import { u32 } from '../../data/numeric.ts';
import { ceil } from '../../std/numeric.ts';
import { allEq } from '../../std/boolean.ts';
import { getName, setName } from '../../shared/meta.ts';
import { logger } from '../../tgpuLogger.ts';
import { safeStringify } from '../../shared/stringify.ts';

/**
 * Changes the given array to a vec of 3 numbers, filling missing values with 1.
 */
function toVec3(arr: readonly (number | undefined)[]): v3u {
  if (arr.includes(0)) {
    throw new Error('Size and workgroupSize cannot contain zeroes.');
  }
  return vec3u(arr[0] ?? 1, arr[1] ?? 1, arr[2] ?? 1);
}

const workgroupSizeConfigs = [
  vec3u(1, 1, 1),
  vec3u(256, 1, 1),
  vec3u(16, 16, 1),
  vec3u(8, 8, 4),
] as const;

export class TgpuGuardedComputePipelineImpl<
  TArgs extends number[],
> implements TgpuGuardedComputePipeline<TArgs> {
  readonly resourceType = 'guarded-compute-pipeline';
  readonly [$soul]: TgpuGuardedComputePipelineSoul;

  #root: ExperimentalTgpuRoot;
  #lastSize: v3u;

  constructor(
    root: ExperimentalTgpuRoot,
    pipeline: TgpuComputePipeline,
    sizeUniform: TgpuUniform<Vec3u>,
    workgroupSize: v3u,
  ) {
    this.#root = root;
    this.#lastSize = vec3u();
    this[$soul] = {
      type: 'guarded-compute-pipeline',
      device: root.device,
      pipeline,
      sizeUniform,
      workgroupSize,
      label: undefined,
    };
  }

  with(bindGroup: TgpuBindGroup): TgpuGuardedComputePipeline<TArgs> {
    if (!isBindGroup(bindGroup)) {
      throw new Error(
        'Guarded pipelines only accept bind groups in .with(). To record into passes or encoders, use a regular compute pipeline.',
      );
    }

    return new TgpuGuardedComputePipelineImpl(
      this.#root,
      this[$soul].pipeline.with(bindGroup),
      this[$soul].sizeUniform,
      this[$soul].workgroupSize,
    );
  }

  withPerformanceCallback(
    callback: (start: bigint, end: bigint) => void | Promise<void>,
  ): TgpuGuardedComputePipeline<TArgs> {
    return new TgpuGuardedComputePipelineImpl(
      this.#root,
      this[$soul].pipeline.withPerformanceCallback(callback),
      this[$soul].sizeUniform,
      this[$soul].workgroupSize,
    );
  }

  withTimestampWrites(options: {
    querySet: TgpuQuerySet<'timestamp'> | GPUQuerySet;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  }): TgpuGuardedComputePipeline<TArgs> {
    return new TgpuGuardedComputePipelineImpl(
      this.#root,
      this[$soul].pipeline.withTimestampWrites(options),
      this[$soul].sizeUniform,
      this[$soul].workgroupSize,
    );
  }

  dispatchThreads(...threads: TArgs): void {
    const sanitizedSize = toVec3(threads);
    const workgroupCount = ceil(vec3f(sanitizedSize).div(vec3f(this[$soul].workgroupSize)));
    if (!allEq(sanitizedSize, this.#lastSize)) {
      // Only updating the size if it has changed from the last
      // invocation. This removes the need for flushing.
      this.#lastSize = sanitizedSize;
      this[$soul].sizeUniform.write(sanitizedSize);
    }
    this[$soul].pipeline.dispatchWorkgroups(workgroupCount.x, workgroupCount.y, workgroupCount.z);
  }

  initAsync(): Promise<void> {
    return this[$soul].pipeline.initAsync();
  }

  initSync(): void {
    this[$soul].pipeline.initSync();
  }

  get pipeline() {
    return this[$soul].pipeline;
  }

  get sizeUniform() {
    return this[$soul].sizeUniform;
  }

  [$internal] = true;
  get [$getNameForward]() {
    return this[$soul].pipeline;
  }
  $name(label: string): this {
    setName(this, label);
    return this;
  }
}

class WithBindingImpl implements WithBinding {
  readonly #getRoot: () => ExperimentalTgpuRoot;
  readonly #slotBindings: [TgpuSlot<unknown>, unknown][];

  constructor(getRoot: () => ExperimentalTgpuRoot, slotBindings: [TgpuSlot<unknown>, unknown][]) {
    this.#getRoot = getRoot;
    this.#slotBindings = slotBindings;
  }

  with<T extends BaseData>(
    slot: TgpuSlot<T> | TgpuAccessor<T> | TgpuMutableAccessor<T>,
    value: TgpuAccessor.In<T> | TgpuMutableAccessor.In<T>,
  ): WithBinding {
    return new WithBindingImpl(this.#getRoot, [
      ...this.#slotBindings,
      [isAccessor(slot) || isMutableAccessor(slot) ? slot.slot : slot, value],
    ]);
  }

  createComputePipeline<ComputeIn extends Record<string, AnyComputeBuiltin>>(
    descriptor: TgpuComputePipeline.Descriptor<ComputeIn>,
  ): TgpuComputePipeline {
    return INTERNAL_createComputePipeline(
      this.#getRoot(),
      this.#slotBindings,
      descriptor as unknown as TgpuComputePipeline.Descriptor,
    );
  }

  createRenderPipeline(
    descriptor: TgpuRenderPipeline.Descriptor,
    // oxlint-disable-next-line typescript/no-explicit-any -- required to be compatible with overloads
  ): TgpuRenderPipeline<any> {
    return INTERNAL_createRenderPipeline({
      root: this.#getRoot(),
      slotBindings: this.#slotBindings,
      descriptor,
    });
  }

  createGuardedComputePipeline<TArgs extends number[]>(
    callback: (...args: TArgs) => undefined,
  ): TgpuGuardedComputePipeline<TArgs> {
    const root = this.#getRoot();

    if (callback.length >= 4) {
      throw new Error('Guarded compute callback only supports up to three dimensions.');
    }

    const workgroupSize = workgroupSizeConfigs[callback.length] as v3u;
    const wrappedCallback = fn([u32, u32, u32])(callback as (...args: number[]) => void);
    if (getName(wrappedCallback) === undefined) {
      wrappedCallback.$name('wrappedCallback');
    }

    const sizeUniform = root.createUniform(vec3u);

    // WGSL instead of JS because we do not run unplugin
    // before shipping the typegpu package
    const mainCompute = computeFn({
      workgroupSize,
      in: { id: builtin.globalInvocationId },
    })`{
  if (any(in.id >= sizeUniform)) {
    return;
  }
  wrappedCallback(in.id.x, in.id.y, in.id.z);
}`.$uses({ sizeUniform, wrappedCallback });

    // NOTE: in certain setups, unplugin can run on package typegpu, so we have to avoid auto-naming triggering here
    const pipeline = (() => this.createComputePipeline({ compute: mainCompute }))();

    return new TgpuGuardedComputePipelineImpl(root, pipeline, sizeUniform, workgroupSize);
  }

  pipe(transform: (cfg: Configurable) => Configurable): WithBinding {
    const newCfg = transform(new ConfigurableImpl([]));
    return new WithBindingImpl(this.#getRoot, [...this.#slotBindings, ...newCfg.bindings]);
  }
}

type MaterializeInternals = {
  readonly materialize?: (() => unknown) | undefined;
};

type UnwrapResult =
  | GPUComputePipeline
  | GPURenderPipeline
  | GPUCommandEncoder
  | GPURenderPassEncoder
  | GPUComputePassEncoder
  | GPURenderBundleEncoder
  | GPUBindGroupLayout
  | GPUBindGroup
  | GPUBuffer
  | GPUTexture
  | GPUTextureView
  | GPUVertexBufferLayout
  | GPUSampler
  | GPUQuerySet;

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a root can interact via GPU buffers.
 */
class TgpuRootImpl extends WithBindingImpl implements TgpuRoot, ExperimentalTgpuRoot {
  '~unstable': TgpuRoot['~unstable'];

  readonly resourceType = 'root';
  readonly [$soul]: TgpuRootSoul;
  readonly device: GPUDevice;
  readonly nameRegistrySetting: 'random' | 'strict';
  readonly shaderGenerator: ShaderGenerator | undefined;

  #unwrappedBindGroupLayouts = new WeakMemo((key: TgpuBindGroupLayout) => key.unwrap(this));
  #unwrappedBindGroups = new WeakMemo((key: TgpuBindGroup) => key.unwrap(this));
  #ownDevice: boolean;

  [$internal]: {
    logOptions: LogGeneratorOptions;
  };

  constructor(
    device: GPUDevice,
    nameRegistrySetting: 'random' | 'strict',
    minify: boolean,
    ownDevice: boolean,
    logOptions: LogGeneratorOptions,
    shaderGenerator?: ShaderGenerator,
  ) {
    super(() => this, []);

    this.device = device;
    this.nameRegistrySetting = nameRegistrySetting;
    this.#ownDevice = ownDevice;
    this.shaderGenerator = shaderGenerator;

    this['~unstable'] = this;
    this[$soul] = {
      type: 'root',
      device,
      nameRegistrySetting,
      logOptions,
      minify,
      nonTransferablePriors: shaderGenerator ? ['shaderGenerator'] : undefined,
      label: undefined,
    };
    this[$internal] = {
      logOptions,
    };
  }

  configureContext(options: ConfigureContextOptions): GPUCanvasContext {
    const context = options.canvas.getContext('webgpu');
    if (!context) {
      throw new Error("Unable to initialize 'webgpu' context on the provided canvas.");
    }
    context.configure({
      ...options,
      device: this.device,
      format: options.format ?? navigator.gpu.getPreferredCanvasFormat(),
    });
    return context;
  }

  get enabledFeatures() {
    return new Set(this.device.features) as ReadonlySet<GPUFeatureName>;
  }

  createBuffer<TData extends AnyData>(
    typeSchema: TData,
    initialOrBuffer?: BufferInitialData<TData> | GPUBuffer,
  ): TgpuBuffer<TData> {
    return INTERNAL_createBuffer(this, typeSchema, initialOrBuffer);
  }

  createUniform<TData extends AnyWgslData>(
    typeSchema: TData,
    initialOrBuffer?: BufferInitialData<TData> | GPUBuffer,
  ): TgpuUniform<TData> {
    const buffer = INTERNAL_createBuffer(this, typeSchema, initialOrBuffer)
      // oxlint-disable-next-line typescript/no-explicit-any -- i'm sure it's fine
      .$usage('uniform' as any);

    return new TgpuBufferBindingImpl('uniform', buffer);
  }

  createMutable<TData extends AnyWgslData>(
    typeSchema: TData,
    initialOrBuffer?: BufferInitialData<TData> | GPUBuffer,
  ): TgpuMutable<TData> {
    const buffer = INTERNAL_createBuffer(this, typeSchema, initialOrBuffer)
      // oxlint-disable-next-line typescript/no-explicit-any -- i'm sure it's fine
      .$usage('storage' as any);

    return new TgpuBufferBindingImpl('mutable', buffer);
  }

  createReadonly<TData extends AnyWgslData>(
    typeSchema: TData,
    initialOrBuffer?: BufferInitialData<TData> | GPUBuffer,
  ): TgpuReadonly<TData> {
    const buffer = INTERNAL_createBuffer(this, typeSchema, initialOrBuffer)
      // oxlint-disable-next-line typescript/no-explicit-any -- i'm sure it's fine
      .$usage('storage' as any);

    return new TgpuBufferBindingImpl('readonly', buffer);
  }

  createQuerySet<T extends GPUQueryType>(
    type: T,
    count: number,
    rawQuerySet?: GPUQuerySet,
  ): TgpuQuerySet<T> {
    return INTERNAL_createQuerySet(this, type, count, rawQuerySet);
  }

  createBindGroup<
    Entries extends Record<string, TgpuLayoutEntry | null> = Record<string, TgpuLayoutEntry | null>,
  >(layout: TgpuBindGroupLayout<Entries>, entries: ExtractBindGroupInputFromLayout<Entries>) {
    return new TgpuBindGroupImpl(layout, entries);
  }

  destroy() {
    clearTextureUtilsCache(this.device);

    if (this.#ownDevice) {
      this.device.destroy();
    }
  }

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
  > {
    const texture = INTERNAL_createTexture(props, this);
    // oxlint-disable-next-line typescript/no-explicit-any -- too much type wrangling
    return texture as any;
  }

  createSampler(props: WgslSamplerProps): TgpuFixedSampler {
    return INTERNAL_createSampler(props, this);
  }

  createComparisonSampler(props: WgslComparisonSamplerProps): TgpuFixedComparisonSampler {
    return INTERNAL_createComparisonSampler(props, this);
  }

  unwrap(resource: TgpuComputePipeline): GPUComputePipeline;
  unwrap(resource: TgpuRenderPipeline): GPURenderPipeline;
  unwrap(resource: TgpuCommandEncoder): GPUCommandEncoder;
  unwrap(resource: TgpuRenderPass): GPURenderPassEncoder;
  unwrap(resource: TgpuComputePass): GPUComputePassEncoder;
  unwrap(resource: TgpuRenderBundleEncoder): GPURenderBundleEncoder;
  unwrap(resource: TgpuBindGroupLayout): GPUBindGroupLayout;
  unwrap(resource: TgpuBindGroup): GPUBindGroup;
  unwrap(resource: TgpuBuffer<BaseData>): GPUBuffer;
  unwrap(resource: TgpuBufferBinding<BaseData>): GPUBuffer;
  unwrap(resource: TgpuTexture): GPUTexture;
  unwrap(resource: TgpuTextureView): GPUTextureView;
  unwrap(resource: TgpuVertexLayout): GPUVertexBufferLayout;
  unwrap(resource: TgpuSampler): GPUSampler;
  unwrap(resource: TgpuComparisonSampler): GPUSampler;
  unwrap(resource: TgpuQuerySet<GPUQueryType>): GPUQuerySet;
  unwrap(
    resource:
      | TgpuComputePipeline
      | TgpuRenderPipeline
      | TgpuCommandEncoder
      | TgpuRenderPass
      | TgpuComputePass
      | TgpuRenderBundleEncoder
      | TgpuBindGroupLayout
      | TgpuBindGroup
      | TgpuBuffer<BaseData>
      | TgpuBufferBinding<BaseData>
      | TgpuTexture
      | TgpuTextureView
      | TgpuVertexLayout
      | TgpuSampler
      | TgpuComparisonSampler
      | TgpuQuerySet<GPUQueryType>,
  ): UnwrapResult {
    if (isTgpuCommandEncoder(resource)) {
      return resource[$internal].rawEncoder;
    }

    if (isTgpuRenderCommands(resource) || isTgpuComputePass(resource)) {
      resource[$internal].state.rawAccessed = true;
      return resource[$internal].rawPass;
    }

    if (isBindGroupLayout(resource)) {
      return this.#unwrappedBindGroupLayouts.getOrMake(resource);
    }

    if (isBindGroup(resource)) {
      return this.#unwrappedBindGroups.getOrMake(resource);
    }

    if (isBufferBinding(resource)) {
      return resource.buffer.buffer;
    }

    if (isTextureView(resource)) {
      if (!resource[$internal].unwrap) {
        throw new Error('Cannot unwrap laid-out texture view as it has no underlying resource.');
      }
      return resource[$internal].unwrap();
    }

    if (isVertexLayout(resource)) {
      return resource.vertexLayout;
    }

    const internals = (resource as { [$internal]?: MaterializeInternals })[$internal];
    if (internals?.materialize) {
      return internals.materialize() as UnwrapResult;
    }

    if (isSampler(resource) || isComparisonSampler(resource)) {
      throw new Error('Cannot unwrap laid-out sampler.');
    }

    throw new Error(`Unknown resource type: ${safeStringify(resource)}`);
  }

  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): TgpuCommandEncoder {
    return INTERNAL_createCommandEncoder(this, descriptor);
  }

  createRenderBundleEncoder(descriptor: GPURenderBundleEncoderDescriptor): TgpuRenderBundleEncoder {
    return INTERNAL_createRenderBundleEncoder(this, descriptor);
  }

  flush() {
    logger.warn('deprecated', 'flush() has been deprecated, and has no effect.');
  }
}

/**
 * Options passed into {@link init}.
 */
export type InitOptions = {
  adapter?: GPURequestAdapterOptions | undefined;
  device?: (GPUDeviceDescriptor & { optionalFeatures?: Iterable<GPUFeatureName> }) | undefined;
  /** @default 'strict' */
  unstable_names?: 'random' | 'strict' | undefined;
  /**
   * If set to true, rooted resolves will be stripped of all excessive spaces.
   * Rooted resolves include pipelines and all their transitive dependencies,
   * but not, for example, `tgpu.resolve([MyStruct])`,
   * as there may be multiple roots with different settings in one program.
   *
   * @default false
   */
  unstable_minify?: boolean;
  /**
   * A custom shader code generator, used when resolving TypeGPU functions.
   * If not provided, the default WGSL generator will be used.
   */
  unstable_shaderGenerator?: ShaderGenerator | undefined;
  unstable_logOptions?: LogGeneratorOptions;
};

// TODO: merge these types
/**
 * Options passed into {@link initFromDevice}.
 */
export type InitFromDeviceOptions = {
  device: GPUDevice;
  /** @default 'strict' */
  unstable_names?: 'random' | 'strict' | undefined;
  /**
   * If set to true, rooted resolves will be stripped of all excessive spaces.
   * Rooted resolves include pipelines and all their transitive dependencies,
   * but not, for example, `tgpu.resolve([MyStruct])`,
   * as there may be multiple roots with different settings in one program.
   *
   * @default false
   */
  unstable_minify?: boolean;
  /**
   * A custom shader code generator, used when resolving TypeGPU functions.
   * If not provided, the default WGSL generator will be used.
   */
  unstable_shaderGenerator?: ShaderGenerator | undefined;
  unstable_logOptions?: LogGeneratorOptions;
};

/**
 * Requests a new GPU device and creates a root around it.
 * If a specific device should be used instead, use @see initFromDevice.
 *
 * @example
 * When given no options, the function will ask the browser for a suitable GPU device.
 * ```ts
 * const root = await tgpu.init();
 * ```
 *
 * @example
 * If there are specific options that should be used when requesting a device, you can pass those in.
 * ```ts
 * const adapterOptions: GPURequestAdapterOptions = ...;
 * const deviceDescriptor: GPUDeviceDescriptor = ...;
 * const root = await tgpu.init({ adapter: adapterOptions, device: deviceDescriptor });
 * ```
 */
export async function init(options?: InitOptions): Promise<TgpuRoot> {
  const {
    adapter: adapterOpt,
    device: deviceOpt,
    unstable_names: names = 'strict',
    unstable_minify: minify = false,
    unstable_logOptions: logOptions,
    unstable_shaderGenerator: shaderGenerator,
  } = options ?? {};

  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported by this browser.');
  }

  const adapter = await navigator.gpu.requestAdapter(adapterOpt);

  if (!adapter) {
    throw new Error('Could not find a compatible GPU');
  }

  const availableFeatures: GPUFeatureName[] = [];
  for (const feature of deviceOpt?.requiredFeatures ?? []) {
    if (!adapter.features.has(feature)) {
      throw new Error(`Requested feature "${feature}" is not supported by the adapter.`);
    }
    availableFeatures.push(feature);
  }
  for (const feature of deviceOpt?.optionalFeatures ?? []) {
    if (adapter.features.has(feature)) {
      availableFeatures.push(feature);
    } else {
      logger.warn(
        'webgpu-feature-missing',
        `Optional feature "${feature}" is not supported by the adapter.`,
      );
    }
  }

  const device = await adapter.requestDevice({
    ...deviceOpt,
    requiredFeatures: availableFeatures,
  });

  return new TgpuRootImpl(device, names, minify, true, logOptions ?? {}, shaderGenerator);
}

/**
 * Creates a root from the given device, instead of requesting it like @see init.
 *
 * @example
 * ```ts
 * const device: GPUDevice = ...;
 * const root = tgpu.initFromDevice({ device });
 * ```
 */
export function initFromDevice(options: InitFromDeviceOptions): TgpuRoot {
  const {
    device,
    unstable_names: names = 'strict',
    unstable_minify: minify = false,
    unstable_logOptions: logOptions,
    unstable_shaderGenerator: shaderGenerator,
  } = options ?? {};

  return new TgpuRootImpl(device, names, minify, false, logOptions ?? {}, shaderGenerator);
}
