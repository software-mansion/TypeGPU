import {
  type AnyComputeBuiltin,
  builtin,
  type OmitBuiltins,
} from '../../builtin.ts';
import {
  INTERNAL_createQuerySet,
  isQuerySet,
  type TgpuQuerySet,
} from '../../core/querySet/querySet.ts';
import type { AnyData, Disarray } from '../../data/dataTypes.ts';
import type {
  AnyWgslData,
  BaseData,
  U16,
  U32,
  v3u,
  Vec3u,
  WgslArray,
} from '../../data/wgslTypes.ts';
import {
  invariant,
  MissingBindGroupsError,
  MissingVertexBuffersError,
} from '../../errors.ts';
import { WeakMemo } from '../../memo.ts';
import { clearTextureUtilsCache } from '../texture/textureUtils.ts';
import type { Infer } from '../../shared/repr.ts';
import { $internal } from '../../shared/symbols.ts';
import type { AnyVertexAttribs } from '../../shared/vertexFormat.ts';
import type {
  ExtractBindGroupInputFromLayout,
  TgpuBindGroup,
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout.ts';
import {
  isBindGroup,
  isBindGroupLayout,
  TgpuBindGroupImpl,
} from '../../tgpuBindGroupLayout.ts';
import type { LogGeneratorOptions } from '../../tgsl/consoleLog/types.ts';
import type { ShaderGenerator } from '../../tgsl/shaderGenerator.ts';
import {
  INTERNAL_createBuffer,
  isBuffer,
  type TgpuBuffer,
  type VertexFlag,
} from '../buffer/buffer.ts';
import {
  TgpuBufferShorthandImpl,
  type TgpuMutable,
  type TgpuReadonly,
  type TgpuUniform,
} from '../buffer/bufferShorthand.ts';
import type { TgpuBufferUsage } from '../buffer/bufferUsage.ts';
import type { IOLayout } from '../function/fnTypes.ts';
import { computeFn, type TgpuComputeFn } from '../function/tgpuComputeFn.ts';
import { fn, type TgpuFn } from '../function/tgpuFn.ts';
import type { TgpuFragmentFn } from '../function/tgpuFragmentFn.ts';
import type { TgpuVertexFn } from '../function/tgpuVertexFn.ts';
import {
  INTERNAL_createComputePipeline,
  type TgpuComputePipeline,
} from '../pipeline/computePipeline.ts';
import {
  type AnyFragmentTargets,
  INTERNAL_createRenderPipeline,
  type RenderPipelineCoreOptions,
  type TgpuRenderPipeline,
} from '../pipeline/renderPipeline.ts';
import { isComputePipeline, isRenderPipeline } from '../pipeline/typeGuards.ts';
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
import type {
  WgslComparisonSamplerProps,
  WgslSamplerProps,
} from '../../data/sampler.ts';
import {
  isAccessor,
  type TgpuAccessor,
  type TgpuSlot,
} from '../slot/slotTypes.ts';
import {
  INTERNAL_createTexture,
  isTexture,
  isTextureView,
  type TgpuTexture,
  type TgpuTextureView,
} from '../texture/texture.ts';
import type { LayoutToAllowedAttribs } from '../vertexLayout/vertexAttribute.ts';
import {
  isVertexLayout,
  type TgpuVertexLayout,
} from '../vertexLayout/vertexLayout.ts';
import { ConfigurableImpl } from './configurableImpl.ts';
import type {
  Configurable,
  CreateTextureOptions,
  CreateTextureResult,
  ExperimentalTgpuRoot,
  RenderPass,
  TgpuGuardedComputePipeline,
  TgpuRoot,
  WithBinding,
  WithCompute,
  WithFragment,
  WithVertex,
} from './rootTypes.ts';
import { vec3f, vec3u } from '../../data/vector.ts';
import { u32 } from '../../data/numeric.ts';
import { ceil } from '../../std/numeric.ts';
import { allEq } from '../../std/boolean.ts';

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

export class TgpuGuardedComputePipelineImpl<TArgs extends number[]>
  implements TgpuGuardedComputePipeline<TArgs> {
  #root: ExperimentalTgpuRoot;
  #pipeline: TgpuComputePipeline;
  #sizeUniform: TgpuUniform<Vec3u>;
  #workgroupSize: v3u;

  #lastSize: v3u;

  constructor(
    root: ExperimentalTgpuRoot,
    pipeline: TgpuComputePipeline,
    sizeUniform: TgpuUniform<Vec3u>,
    workgroupSize: v3u,
  ) {
    this.#root = root;
    this.#pipeline = pipeline;
    this.#sizeUniform = sizeUniform;
    this.#workgroupSize = workgroupSize;
    this.#lastSize = vec3u();
  }

  with(bindGroup: TgpuBindGroup): TgpuGuardedComputePipeline<TArgs> {
    return new TgpuGuardedComputePipelineImpl(
      this.#root,
      this.#pipeline.with(bindGroup),
      this.#sizeUniform,
      this.#workgroupSize,
    );
  }

  dispatchThreads(...threads: TArgs): void {
    const sanitizedSize = toVec3(threads);
    const workgroupCount = ceil(
      vec3f(sanitizedSize).div(vec3f(this.#workgroupSize)),
    );
    if (!allEq(sanitizedSize, this.#lastSize)) {
      // Only updating the size if it has changed from the last
      // invocation. This removes the need for flushing.
      this.#lastSize = sanitizedSize;
      this.#sizeUniform.write(sanitizedSize);
    }
    this.#pipeline.dispatchWorkgroups(
      workgroupCount.x,
      workgroupCount.y,
      workgroupCount.z,
    );
    // Yeah, i know we flush here... but it's only a matter of time!
    this.#root.flush();
  }
}

class WithBindingImpl implements WithBinding {
  constructor(
    private readonly _getRoot: () => ExperimentalTgpuRoot,
    private readonly _slotBindings: [TgpuSlot<unknown>, unknown][],
  ) {}

  with<T extends AnyWgslData>(
    slot: TgpuSlot<T> | TgpuAccessor<T>,
    value: T | TgpuFn<() => T> | TgpuBufferUsage<T> | Infer<T>,
  ): WithBinding {
    return new WithBindingImpl(this._getRoot, [
      ...this._slotBindings,
      [isAccessor(slot) ? slot.slot : slot, value],
    ]);
  }

  withCompute<ComputeIn extends Record<string, AnyComputeBuiltin>>(
    entryFn: TgpuComputeFn<ComputeIn>,
  ): WithCompute {
    return new WithComputeImpl(this._getRoot(), this._slotBindings, entryFn);
  }

  createGuardedComputePipeline<TArgs extends number[]>(
    callback: (...args: TArgs) => undefined,
  ): TgpuGuardedComputePipeline<TArgs> {
    const root = this._getRoot();

    if (callback.length >= 4) {
      throw new Error(
        'Guarded compute callback only supports up to three dimensions.',
      );
    }

    const workgroupSize = workgroupSizeConfigs[callback.length] as v3u;
    const wrappedCallback = fn([u32, u32, u32])(
      callback as (...args: number[]) => void,
    );

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

    const pipeline = this
      .withCompute(mainCompute)
      .createPipeline();

    return new TgpuGuardedComputePipelineImpl(
      root,
      pipeline,
      sizeUniform,
      workgroupSize,
    );
  }

  withVertex<VertexIn extends IOLayout>(
    vertexFn: TgpuVertexFn,
    attribs: LayoutToAllowedAttribs<OmitBuiltins<VertexIn>>,
  ): WithVertex {
    return new WithVertexImpl({
      branch: this._getRoot(),
      primitiveState: undefined,
      depthStencilState: undefined,
      slotBindings: this._slotBindings,
      vertexFn,
      vertexAttribs: attribs as AnyVertexAttribs,
      multisampleState: undefined,
    });
  }

  pipe(transform: (cfg: Configurable) => Configurable): WithBinding {
    const newCfg = transform(new ConfigurableImpl([]));
    return new WithBindingImpl(this._getRoot, [
      ...this._slotBindings,
      ...newCfg.bindings,
    ]);
  }
}

class WithComputeImpl implements WithCompute {
  constructor(
    private readonly _root: ExperimentalTgpuRoot,
    private readonly _slotBindings: [TgpuSlot<unknown>, unknown][],
    private readonly _entryFn: TgpuComputeFn,
  ) {}

  createPipeline(): TgpuComputePipeline {
    return INTERNAL_createComputePipeline(
      this._root,
      this._slotBindings,
      this._entryFn,
    );
  }
}

class WithVertexImpl implements WithVertex {
  constructor(
    private readonly _options: Omit<
      RenderPipelineCoreOptions,
      'fragmentFn' | 'targets'
    >,
  ) {}

  withFragment(
    fragmentFn: TgpuFragmentFn | 'n/a',
    targets: AnyFragmentTargets | 'n/a',
    _mismatch?: unknown,
  ): WithFragment {
    invariant(typeof fragmentFn !== 'string', 'Just type mismatch validation');
    invariant(typeof targets !== 'string', 'Just type mismatch validation');

    return new WithFragmentImpl({
      ...this._options,
      fragmentFn,
      targets,
    });
  }

  withPrimitive(
    primitiveState:
      | GPUPrimitiveState
      | Omit<GPUPrimitiveState, 'stripIndexFormat'> & {
        stripIndexFormat?: U32 | U16;
      }
      | undefined,
  ): WithFragment {
    return new WithVertexImpl({ ...this._options, primitiveState });
  }

  withDepthStencil(
    depthStencilState: GPUDepthStencilState | undefined,
  ): WithFragment {
    return new WithVertexImpl({ ...this._options, depthStencilState });
  }

  withMultisample(
    multisampleState: GPUMultisampleState | undefined,
  ): WithFragment {
    return new WithVertexImpl({ ...this._options, multisampleState });
  }

  createPipeline(): TgpuRenderPipeline {
    return INTERNAL_createRenderPipeline({
      ...this._options,
      fragmentFn: null,
      targets: null,
    });
  }
}

class WithFragmentImpl implements WithFragment {
  constructor(private readonly _options: RenderPipelineCoreOptions) {}

  withPrimitive(
    primitiveState:
      | GPUPrimitiveState
      | Omit<GPUPrimitiveState, 'stripIndexFormat'> & {
        stripIndexFormat?: U32 | U16;
      }
      | undefined,
  ): WithFragment {
    return new WithFragmentImpl({ ...this._options, primitiveState });
  }

  withDepthStencil(
    depthStencilState: GPUDepthStencilState | undefined,
  ): WithFragment {
    return new WithFragmentImpl({ ...this._options, depthStencilState });
  }

  withMultisample(
    multisampleState: GPUMultisampleState | undefined,
  ): WithFragment {
    return new WithFragmentImpl({ ...this._options, multisampleState });
  }

  createPipeline(): TgpuRenderPipeline {
    return INTERNAL_createRenderPipeline(this._options);
  }
}

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a root can interact via GPU buffers.
 */
class TgpuRootImpl extends WithBindingImpl
  implements TgpuRoot, ExperimentalTgpuRoot {
  '~unstable': Omit<ExperimentalTgpuRoot, keyof TgpuRoot>;

  private _unwrappedBindGroupLayouts = new WeakMemo(
    (key: TgpuBindGroupLayout) => key.unwrap(this),
  );
  private _unwrappedBindGroups = new WeakMemo((key: TgpuBindGroup) =>
    key.unwrap(this)
  );

  private _commandEncoder: GPUCommandEncoder | null = null;

  [$internal]: {
    logOptions: LogGeneratorOptions;
  };

  constructor(
    public readonly device: GPUDevice,
    public readonly nameRegistrySetting: 'random' | 'strict',
    private readonly _ownDevice: boolean,
    logOptions: LogGeneratorOptions,
    public readonly shaderGenerator?: ShaderGenerator,
  ) {
    super(() => this, []);

    this['~unstable'] = this;
    this[$internal] = {
      logOptions,
    };
  }

  get commandEncoder() {
    if (!this._commandEncoder) {
      this._commandEncoder = this.device.createCommandEncoder();
    }

    return this._commandEncoder;
  }

  get enabledFeatures() {
    return new Set(this.device.features) as ReadonlySet<GPUFeatureName>;
  }

  createBuffer<TData extends AnyData>(
    typeSchema: TData,
    initialOrBuffer?: Infer<TData> | GPUBuffer,
  ): TgpuBuffer<TData> {
    return INTERNAL_createBuffer(this, typeSchema, initialOrBuffer);
  }

  createUniform<TData extends AnyWgslData>(
    typeSchema: TData,
    initialOrBuffer?: Infer<TData> | GPUBuffer,
  ): TgpuUniform<TData> {
    const buffer = INTERNAL_createBuffer(this, typeSchema, initialOrBuffer)
      // biome-ignore lint/suspicious/noExplicitAny: i'm sure it's fine
      .$usage('uniform' as any);

    return new TgpuBufferShorthandImpl('uniform', buffer);
  }

  createMutable<TData extends AnyWgslData>(
    typeSchema: TData,
    initialOrBuffer?: Infer<TData> | GPUBuffer,
  ): TgpuMutable<TData> {
    const buffer = INTERNAL_createBuffer(this, typeSchema, initialOrBuffer)
      // biome-ignore lint/suspicious/noExplicitAny: i'm sure it's fine
      .$usage('storage' as any);

    return new TgpuBufferShorthandImpl('mutable', buffer);
  }

  createReadonly<TData extends AnyWgslData>(
    typeSchema: TData,
    initialOrBuffer?: Infer<TData> | GPUBuffer,
  ): TgpuReadonly<TData> {
    const buffer = INTERNAL_createBuffer(this, typeSchema, initialOrBuffer)
      // biome-ignore lint/suspicious/noExplicitAny: i'm sure it's fine
      .$usage('storage' as any);

    return new TgpuBufferShorthandImpl('readonly', buffer);
  }

  createQuerySet<T extends GPUQueryType>(
    type: T,
    count: number,
    rawQuerySet?: GPUQuerySet,
  ): TgpuQuerySet<T> {
    return INTERNAL_createQuerySet(this, type, count, rawQuerySet);
  }

  createBindGroup<
    Entries extends Record<string, TgpuLayoutEntry | null> = Record<
      string,
      TgpuLayoutEntry | null
    >,
  >(
    layout: TgpuBindGroupLayout<Entries>,
    entries: ExtractBindGroupInputFromLayout<Entries>,
  ) {
    return new TgpuBindGroupImpl(layout, entries);
  }

  destroy() {
    clearTextureUtilsCache(this.device);

    if (this._ownDevice) {
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
    CreateTextureResult<
      TSize,
      TFormat,
      TMipLevelCount,
      TSampleCount,
      TViewFormats,
      TDimension
    >
  > {
    const texture = INTERNAL_createTexture(props, this);
    // biome-ignore lint/suspicious/noExplicitAny: <too much type wrangling>
    return texture as any;
  }

  createSampler(props: WgslSamplerProps): TgpuFixedSampler {
    return INTERNAL_createSampler(props, this);
  }

  createComparisonSampler(
    props: WgslComparisonSamplerProps,
  ): TgpuFixedComparisonSampler {
    return INTERNAL_createComparisonSampler(props, this);
  }

  unwrap(resource: TgpuComputePipeline): GPUComputePipeline;
  unwrap(resource: TgpuRenderPipeline): GPURenderPipeline;
  unwrap(resource: TgpuBindGroupLayout): GPUBindGroupLayout;
  unwrap(resource: TgpuBindGroup): GPUBindGroup;
  unwrap(resource: TgpuBuffer<AnyData>): GPUBuffer;
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
      | TgpuBindGroupLayout
      | TgpuBindGroup
      | TgpuBuffer<AnyData>
      | TgpuTexture
      | TgpuTextureView
      | TgpuVertexLayout
      | TgpuSampler
      | TgpuComparisonSampler
      | TgpuQuerySet<GPUQueryType>,
  ):
    | GPUComputePipeline
    | GPURenderPipeline
    | GPUBindGroupLayout
    | GPUBindGroup
    | GPUBuffer
    | GPUTexture
    | GPUTextureView
    | GPUVertexBufferLayout
    | GPUSampler
    | GPUQuerySet {
    if (isComputePipeline(resource)) {
      return resource[$internal].rawPipeline;
    }

    if (isRenderPipeline(resource)) {
      return resource[$internal].core.unwrap().pipeline;
    }

    if (isBindGroupLayout(resource)) {
      return this._unwrappedBindGroupLayouts.getOrMake(resource);
    }

    if (isBindGroup(resource)) {
      return this._unwrappedBindGroups.getOrMake(resource);
    }

    if (isBuffer(resource)) {
      return resource.buffer;
    }

    if (isTexture(resource)) {
      return resource[$internal].unwrap();
    }

    if (isTextureView(resource)) {
      if (!resource[$internal].unwrap) {
        throw new Error(
          'Cannot unwrap laid-out texture view as it has no underlying resource.',
        );
      }
      return resource[$internal].unwrap();
    }

    if (isVertexLayout(resource)) {
      return resource.vertexLayout;
    }

    if (isSampler(resource) || isComparisonSampler(resource)) {
      if (resource[$internal].unwrap) {
        return resource[$internal].unwrap();
      }
      throw new Error('Cannot unwrap laid-out sampler.');
    }

    if (isQuerySet(resource)) {
      return resource.querySet;
    }

    throw new Error(`Unknown resource type: ${resource}`);
  }

  beginRenderPass(
    descriptor: GPURenderPassDescriptor,
    callback: (pass: RenderPass) => void,
  ): void {
    const pass = this.commandEncoder.beginRenderPass(descriptor);

    const bindGroups = new Map<
      TgpuBindGroupLayout,
      TgpuBindGroup | GPUBindGroup
    >();
    const vertexBuffers = new Map<
      TgpuVertexLayout,
      {
        buffer:
          | (TgpuBuffer<WgslArray<BaseData> | Disarray<BaseData>> & VertexFlag)
          | GPUBuffer;
        offset?: number | undefined;
        size?: number | undefined;
      }
    >();

    let currentPipeline: TgpuRenderPipeline | undefined;

    const setupPassBeforeDraw = () => {
      if (!currentPipeline) {
        throw new Error('Cannot draw without a call to pass.setPipeline');
      }

      const { core, priors } = currentPipeline[$internal];
      const memo = core.unwrap();

      pass.setPipeline(memo.pipeline);

      const missingBindGroups = new Set(memo.usedBindGroupLayouts);
      memo.usedBindGroupLayouts.forEach((layout, idx) => {
        if (memo.catchall && idx === memo.catchall[0]) {
          // Catch-all
          pass.setBindGroup(idx, this.unwrap(memo.catchall[1]));
          missingBindGroups.delete(layout);
        } else {
          const bindGroup = priors.bindGroupLayoutMap?.get(layout) ??
            bindGroups.get(layout);
          if (bindGroup !== undefined) {
            missingBindGroups.delete(layout);
            if (isBindGroup(bindGroup)) {
              pass.setBindGroup(idx, this.unwrap(bindGroup));
            } else {
              pass.setBindGroup(idx, bindGroup);
            }
          }
        }
      });

      const missingVertexLayouts = new Set<TgpuVertexLayout>();
      core.usedVertexLayouts.forEach((vertexLayout, idx) => {
        const priorBuffer = priors.vertexLayoutMap?.get(vertexLayout);
        const opts = priorBuffer
          ? {
            buffer: priorBuffer,
            offset: undefined,
            size: undefined,
          }
          : vertexBuffers.get(vertexLayout);

        if (!opts || !opts.buffer) {
          missingVertexLayouts.add(vertexLayout);
        } else if (isBuffer(opts.buffer)) {
          pass.setVertexBuffer(
            idx,
            this.unwrap(opts.buffer),
            opts.offset,
            opts.size,
          );
        } else {
          pass.setVertexBuffer(idx, opts.buffer, opts.offset, opts.size);
        }
      });

      if (missingBindGroups.size > 0) {
        throw new MissingBindGroupsError(missingBindGroups);
      }

      if (missingVertexLayouts.size > 0) {
        throw new MissingVertexBuffersError(missingVertexLayouts);
      }
    };

    callback({
      setViewport(...args) {
        pass.setViewport(...args);
      },
      setScissorRect(...args) {
        pass.setScissorRect(...args);
      },
      setBlendConstant(...args) {
        pass.setBlendConstant(...args);
      },
      setStencilReference(...args) {
        pass.setStencilReference(...args);
      },
      beginOcclusionQuery(...args) {
        pass.beginOcclusionQuery(...args);
      },
      endOcclusionQuery(...args) {
        pass.endOcclusionQuery(...args);
      },
      executeBundles(...args) {
        pass.executeBundles(...args);
      },
      setPipeline(pipeline) {
        currentPipeline = pipeline;
      },

      setIndexBuffer: (buffer, indexFormat, offset, size) => {
        if (isBuffer(buffer)) {
          pass.setIndexBuffer(this.unwrap(buffer), indexFormat, offset, size);
        } else {
          pass.setIndexBuffer(buffer, indexFormat, offset, size);
        }
      },

      setVertexBuffer(vertexLayout, buffer, offset, size) {
        vertexBuffers.set(vertexLayout, { buffer, offset, size });
      },

      setBindGroup(bindGroupLayout, bindGroup) {
        bindGroups.set(bindGroupLayout, bindGroup);
      },

      draw(vertexCount, instanceCount, firstVertex, firstInstance) {
        setupPassBeforeDraw();
        pass.draw(vertexCount, instanceCount, firstVertex, firstInstance);
      },

      drawIndexed(...args) {
        setupPassBeforeDraw();
        pass.drawIndexed(...args);
      },

      drawIndirect(...args) {
        setupPassBeforeDraw();
        pass.drawIndirect(...args);
      },

      drawIndexedIndirect(...args) {
        setupPassBeforeDraw();
        pass.drawIndexedIndirect(...args);
      },
    });

    pass.end();
  }

  flush() {
    if (!this._commandEncoder) {
      return;
    }

    this.device.queue.submit([this._commandEncoder.finish()]);
    this._commandEncoder = null;
  }
}

/**
 * Options passed into {@link init}.
 */
export type InitOptions = {
  adapter?: GPURequestAdapterOptions | undefined;
  device?:
    | GPUDeviceDescriptor & { optionalFeatures?: Iterable<GPUFeatureName> }
    | undefined;
  /** @default 'random' */
  unstable_names?: 'random' | 'strict' | undefined;
  /**
   * A custom shader code generator, used when resolving TGSL.
   * If not provided, the default WGSL generator will be used.
   */
  shaderGenerator?: ShaderGenerator | undefined;
  unstable_logOptions?: LogGeneratorOptions;
};

/**
 * Options passed into {@link initFromDevice}.
 */
export type InitFromDeviceOptions = {
  device: GPUDevice;
  /** @default 'random' */
  unstable_names?: 'random' | 'strict' | undefined;
  /**
   * A custom shader code generator, used when resolving TGSL.
   * If not provided, the default WGSL generator will be used.
   */
  shaderGenerator?: ShaderGenerator | undefined;
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
    unstable_names: names = 'random',
    unstable_logOptions,
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
      throw new Error(
        `Requested feature "${feature}" is not supported by the adapter.`,
      );
    }
    availableFeatures.push(feature);
  }
  for (const feature of deviceOpt?.optionalFeatures ?? []) {
    if (adapter.features.has(feature)) {
      availableFeatures.push(feature);
    } else {
      console.warn(
        `Optional feature "${feature}" is not supported by the adapter.`,
      );
    }
  }

  const device = await adapter.requestDevice({
    ...deviceOpt,
    requiredFeatures: availableFeatures,
  });

  return new TgpuRootImpl(
    device,
    names,
    true,
    unstable_logOptions ?? {},
    options?.shaderGenerator,
  );
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
    unstable_names: names = 'random',
    unstable_logOptions,
  } = options ?? {};

  return new TgpuRootImpl(
    device,
    names,
    false,
    unstable_logOptions ?? {},
    options?.shaderGenerator,
  );
}
