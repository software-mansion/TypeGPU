import type { AnyComputeBuiltin, OmitBuiltins } from '../../builtin.ts';
import type { AnyData, Disarray } from '../../data/dataTypes.ts';
import type { AnyWgslData, BaseData, WgslArray } from '../../data/wgslTypes.ts';
import {
  MissingBindGroupsError,
  MissingVertexBuffersError,
  invariant,
} from '../../errors.ts';
import type { JitTranspiler } from '../../jitTranspiler.ts';
import { WeakMemo } from '../../memo.ts';
import {
  type NameRegistry,
  RandomNameRegistry,
  StrictNameRegistry,
} from '../../nameRegistry.ts';
import type { Infer } from '../../shared/repr.ts';
import { $internal } from '../../shared/symbols.ts';
import type { AnyVertexAttribs } from '../../shared/vertexFormat.ts';
import type {
  LayoutEntryToInput,
  TgpuBindGroup,
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout.ts';
import {
  TgpuBindGroupImpl,
  isBindGroup,
  isBindGroupLayout,
} from '../../tgpuBindGroupLayout.ts';
import {
  INTERNAL_createBuffer,
  type TgpuBuffer,
  type VertexFlag,
  isBuffer,
} from '../buffer/buffer.ts';
import type {
  TgpuBufferMutable,
  TgpuBufferReadonly,
  TgpuBufferUniform,
  TgpuBufferUsage,
  TgpuFixedBufferUsage,
} from '../buffer/bufferUsage.ts';
import type { IOLayout } from '../function/fnTypes.ts';
import type { TgpuComputeFn } from '../function/tgpuComputeFn.ts';
import type { TgpuFn } from '../function/tgpuFn.ts';
import type {
  FragmentOutConstrained,
  TgpuFragmentFn,
} from '../function/tgpuFragmentFn.ts';
import type { TgpuVertexFn } from '../function/tgpuVertexFn.ts';
import {
  type INTERNAL_TgpuComputePipeline,
  INTERNAL_createComputePipeline,
  type TgpuComputePipeline,
  isComputePipeline,
} from '../pipeline/computePipeline.ts';
import {
  type AnyFragmentTargets,
  INTERNAL_createRenderPipeline,
  type RenderPipelineCoreOptions,
  type TgpuRenderPipeline,
  isRenderPipeline,
} from '../pipeline/renderPipeline.ts';
import {
  type INTERNAL_TgpuFixedSampler,
  type TgpuComparisonSampler,
  type TgpuSampler,
  isComparisonSampler,
  isSampler,
} from '../sampler/sampler.ts';
import {
  type TgpuAccessor,
  type TgpuSlot,
  isAccessor,
} from '../slot/slotTypes.ts';
import {
  type INTERNAL_TgpuFixedSampledTexture,
  type INTERNAL_TgpuFixedStorageTexture,
  type INTERNAL_TgpuTexture,
  INTERNAL_createTexture,
  type TgpuMutableTexture,
  type TgpuReadonlyTexture,
  type TgpuSampledTexture,
  type TgpuTexture,
  type TgpuWriteonlyTexture,
  isSampledTextureView,
  isStorageTextureView,
  isTexture,
} from '../texture/texture.ts';
import type { LayoutToAllowedAttribs } from '../vertexLayout/vertexAttribute.ts';
import {
  type TgpuVertexLayout,
  isVertexLayout,
} from '../vertexLayout/vertexLayout.ts';
import type {
  CreateTextureOptions,
  CreateTextureResult,
  ExperimentalTgpuRoot,
  RenderPass,
  TgpuRoot,
  WithBinding,
  WithCompute,
  WithFragment,
  WithVertex,
} from './rootTypes.ts';

class WithBindingImpl implements WithBinding {
  constructor(
    private readonly _getRoot: () => ExperimentalTgpuRoot,
    private readonly _slotBindings: [TgpuSlot<unknown>, unknown][],
  ) {}

  with<T extends AnyWgslData>(
    slot: TgpuSlot<T> | TgpuAccessor<T>,
    value: T | TgpuFn<[], T> | TgpuBufferUsage<T> | Infer<T>,
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
}

class WithFragmentImpl implements WithFragment {
  constructor(private readonly _options: RenderPipelineCoreOptions) {}

  withPrimitive(primitiveState: GPUPrimitiveState | undefined): WithFragment {
    return new WithFragmentImpl({ ...this._options, primitiveState });
  }

  withDepthStencil(
    depthStencilState: GPUDepthStencilState | undefined,
  ): WithFragment {
    return new WithFragmentImpl({ ...this._options, depthStencilState });
  }

  withMultisample(
    multisampleState: GPUMultisampleState | undefined,
  ): WithFragment<FragmentOutConstrained> {
    return new WithFragmentImpl({ ...this._options, multisampleState });
  }

  createPipeline(): TgpuRenderPipeline {
    return INTERNAL_createRenderPipeline(this._options);
  }
}

interface Disposable {
  destroy(): void;
}

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a root can interact via GPU buffers.
 */
class TgpuRootImpl
  extends WithBindingImpl
  implements TgpuRoot, ExperimentalTgpuRoot
{
  '~unstable': Omit<ExperimentalTgpuRoot, keyof TgpuRoot>;

  private _disposables: Disposable[] = [];

  private _unwrappedBindGroupLayouts = new WeakMemo(
    (key: TgpuBindGroupLayout) => key.unwrap(this),
  );
  private _unwrappedBindGroups = new WeakMemo((key: TgpuBindGroup) =>
    key.unwrap(this),
  );

  private _commandEncoder: GPUCommandEncoder | null = null;

  constructor(
    public readonly device: GPUDevice,
    public readonly nameRegistry: NameRegistry,
    public readonly jitTranspiler: JitTranspiler | undefined,
    private readonly _ownDevice: boolean,
  ) {
    super(() => this, []);

    this['~unstable'] = this;
  }

  get commandEncoder() {
    if (!this._commandEncoder) {
      this._commandEncoder = this.device.createCommandEncoder();
    }

    return this._commandEncoder;
  }

  createBuffer<TData extends AnyData>(
    typeSchema: TData,
    initialOrBuffer?: Infer<TData> | GPUBuffer,
  ): TgpuBuffer<TData> {
    const buffer = INTERNAL_createBuffer(this, typeSchema, initialOrBuffer);
    this._disposables.push(buffer);
    return buffer;
  }

  createUniform<TData extends AnyWgslData>(
    typeSchema: TData,
    initialOrBuffer?: Infer<TData> | GPUBuffer,
  ): TgpuBufferUniform<TData> & TgpuFixedBufferUsage<TData> {
    return this.createBuffer<AnyWgslData>(typeSchema, initialOrBuffer)
      .$usage('uniform')
      .as('uniform') as TgpuBufferUniform<TData> & TgpuFixedBufferUsage<TData>;
  }

  createMutable<TData extends AnyWgslData>(
    typeSchema: TData,
    initialOrBuffer?: Infer<TData> | GPUBuffer,
  ): TgpuBufferMutable<TData> & TgpuFixedBufferUsage<TData> {
    return this.createBuffer<AnyWgslData>(typeSchema, initialOrBuffer)
      .$usage('storage')
      .as('mutable') as TgpuBufferMutable<TData> & TgpuFixedBufferUsage<TData>;
  }

  createReadonly<TData extends AnyWgslData>(
    typeSchema: TData,
    initialOrBuffer?: Infer<TData> | GPUBuffer,
  ): TgpuBufferReadonly<TData> & TgpuFixedBufferUsage<TData> {
    return this.createBuffer<AnyWgslData>(typeSchema, initialOrBuffer)
      .$usage('storage')
      .as('readonly') as TgpuBufferReadonly<TData> &
      TgpuFixedBufferUsage<TData>;
  }

  createBindGroup<
    Entries extends Record<string, TgpuLayoutEntry | null> = Record<
      string,
      TgpuLayoutEntry | null
    >,
  >(
    layout: TgpuBindGroupLayout<Entries>,
    entries: {
      [K in keyof Entries]: LayoutEntryToInput<Entries[K]>;
    },
  ) {
    return new TgpuBindGroupImpl(layout, entries);
  }

  destroy() {
    for (const disposable of this._disposables) {
      disposable.destroy();
    }

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
  > {
    const texture = INTERNAL_createTexture(props, this);
    this._disposables.push(texture);
    // biome-ignore lint/suspicious/noExplicitAny: <too much type wrangling>
    return texture as any;
  }

  unwrap(resource: TgpuComputePipeline): GPUComputePipeline;
  unwrap(resource: TgpuRenderPipeline): GPURenderPipeline;
  unwrap(resource: TgpuBindGroupLayout): GPUBindGroupLayout;
  unwrap(resource: TgpuBindGroup): GPUBindGroup;
  unwrap(resource: TgpuBuffer<AnyData>): GPUBuffer;
  unwrap(resource: TgpuTexture): GPUTexture;
  unwrap(
    resource:
      | TgpuReadonlyTexture
      | TgpuWriteonlyTexture
      | TgpuMutableTexture
      | TgpuSampledTexture,
  ): GPUTextureView;
  unwrap(resource: TgpuVertexLayout): GPUVertexBufferLayout;
  unwrap(resource: TgpuSampler): GPUSampler;
  unwrap(resource: TgpuComparisonSampler): GPUSampler;
  unwrap(
    resource:
      | TgpuComputePipeline
      | TgpuRenderPipeline
      | TgpuBindGroupLayout
      | TgpuBindGroup
      | TgpuBuffer<AnyData>
      | TgpuTexture
      | TgpuReadonlyTexture
      | TgpuWriteonlyTexture
      | TgpuMutableTexture
      | TgpuSampledTexture
      | TgpuVertexLayout
      | TgpuSampler
      | TgpuComparisonSampler,
  ):
    | GPUComputePipeline
    | GPURenderPipeline
    | GPUBindGroupLayout
    | GPUBindGroup
    | GPUBuffer
    | GPUTexture
    | GPUTextureView
    | GPUVertexBufferLayout
    | GPUSampler {
    if (isComputePipeline(resource)) {
      return (resource as unknown as INTERNAL_TgpuComputePipeline).rawPipeline;
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
      return (resource as unknown as INTERNAL_TgpuTexture).unwrap();
    }

    if (isStorageTextureView(resource)) {
      // TODO: Verify that `resource` is actually a fixed view, not a laid-out one
      return (resource as unknown as INTERNAL_TgpuFixedStorageTexture).unwrap();
    }

    if (isSampledTextureView(resource)) {
      // TODO: Verify that `resource` is actually a fixed view, not a laid-out one
      return (resource as unknown as INTERNAL_TgpuFixedSampledTexture).unwrap();
    }

    if (isVertexLayout(resource)) {
      return resource.vertexLayout;
    }

    if (isSampler(resource)) {
      if ('unwrap' in resource) {
        return (resource as INTERNAL_TgpuFixedSampler).unwrap(this);
      }
      throw new Error('Cannot unwrap laid-out sampler.');
    }

    if (isComparisonSampler(resource)) {
      if ('unwrap' in resource) {
        return (resource as INTERNAL_TgpuFixedSampler).unwrap(this);
      }
      throw new Error('Cannot unwrap laid-out comparison sampler.');
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

      const missingBindGroups = new Set(memo.bindGroupLayouts);
      memo.bindGroupLayouts.forEach((layout, idx) => {
        if (memo.catchall && idx === memo.catchall[0]) {
          // Catch-all
          pass.setBindGroup(idx, this.unwrap(memo.catchall[1]));
          missingBindGroups.delete(layout);
        } else {
          const bindGroup =
            priors.bindGroupLayoutMap?.get(layout) ?? bindGroups.get(layout);
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
  device?: GPUDeviceDescriptor | undefined;
  /** @default 'random' */
  unstable_names?: 'random' | 'strict' | undefined;
  unstable_jitTranspiler?: JitTranspiler | undefined;
};

/**
 * Options passed into {@link initFromDevice}.
 */
export type InitFromDeviceOptions = {
  device: GPUDevice;
  /** @default 'random' */
  unstable_names?: 'random' | 'strict' | undefined;
  unstable_jitTranspiler?: JitTranspiler | undefined;
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
    unstable_jitTranspiler: jitTranspiler,
  } = options ?? {};

  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported by this browser.');
  }

  const adapter = await navigator.gpu.requestAdapter(adapterOpt);

  if (!adapter) {
    throw new Error('Could not find a compatible GPU');
  }

  return new TgpuRootImpl(
    await adapter.requestDevice(deviceOpt),
    names === 'random' ? new RandomNameRegistry() : new StrictNameRegistry(),
    jitTranspiler,
    true,
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
    unstable_jitTranspiler: jitTranspiler,
  } = options ?? {};

  return new TgpuRootImpl(
    device,
    names === 'random' ? new RandomNameRegistry() : new StrictNameRegistry(),
    jitTranspiler,
    false,
  );
}
