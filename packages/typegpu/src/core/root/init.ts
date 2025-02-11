import type { AnyComputeBuiltin, OmitBuiltins } from '../../builtin';
import type { AnyWgslData } from '../../data';
import type { AnyData } from '../../data/dataTypes';
import { invariant } from '../../errors';
import type { JitTranspiler } from '../../jitTranspiler';
import { WeakMemo } from '../../memo';
import {
  type NameRegistry,
  RandomNameRegistry,
  StrictNameRegistry,
} from '../../nameRegistry';
import type { Infer } from '../../shared/repr';
import type { AnyVertexAttribs } from '../../shared/vertexFormat';
import type {
  LayoutEntryToInput,
  TgpuBindGroup,
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout';
import {
  TgpuBindGroupImpl,
  isBindGroup,
  isBindGroupLayout,
} from '../../tgpuBindGroupLayout';
import {
  INTERNAL_createBuffer,
  type TgpuBuffer,
  isBuffer,
} from '../buffer/buffer';
import type {
  TgpuBufferMutable,
  TgpuBufferReadonly,
  TgpuBufferUniform,
  TgpuBufferUsage,
  TgpuFixedBufferUsage,
} from '../buffer/bufferUsage';
import type { IOLayout } from '../function/fnTypes';
import type { TgpuComputeFn } from '../function/tgpuComputeFn';
import type { TgpuFn } from '../function/tgpuFn';
import type { TgpuFragmentFn } from '../function/tgpuFragmentFn';
import type { TgpuVertexFn } from '../function/tgpuVertexFn';
import {
  type INTERNAL_TgpuComputePipeline,
  INTERNAL_createComputePipeline,
  type TgpuComputePipeline,
  isComputePipeline,
} from '../pipeline/computePipeline';
import {
  type AnyFragmentTargets,
  INTERNAL_createRenderPipeline,
  type RenderPipelineCoreOptions,
  type TgpuRenderPipeline,
} from '../pipeline/renderPipeline';
import {
  type TgpuAccessor,
  type TgpuSlot,
  isAccessor,
} from '../slot/slotTypes';
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
} from '../texture/texture';
import type { LayoutToAllowedAttribs } from '../vertexLayout/vertexAttribute';
import type {
  CreateTextureOptions,
  CreateTextureResult,
  ExperimentalTgpuRoot,
  TgpuRoot,
  WithBinding,
  WithCompute,
  WithFragment,
  WithVertex,
} from './rootTypes';

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

    this['~unstable'] = {
      nameRegistry: this.nameRegistry,
      commandEncoder: this.commandEncoder,

      createUniform: this.createUniform.bind(this),
      createMutable: this.createMutable.bind(this),
      createReadonly: this.createReadonly.bind(this),

      createTexture: this.createTexture.bind(this),

      with: this.with.bind(this),
      withCompute: this.withCompute.bind(this),
      withVertex: this.withVertex.bind(this),

      flush: this.flush.bind(this),
    };
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
  unwrap(
    resource:
      | TgpuComputePipeline
      | TgpuBindGroupLayout
      | TgpuBindGroup
      | TgpuBuffer<AnyData>
      | TgpuTexture
      | TgpuReadonlyTexture
      | TgpuWriteonlyTexture
      | TgpuMutableTexture
      | TgpuSampledTexture,
  ):
    | GPUComputePipeline
    | GPUBindGroupLayout
    | GPUBindGroup
    | GPUBuffer
    | GPUTexture
    | GPUTextureView {
    if (isComputePipeline(resource)) {
      return (resource as unknown as INTERNAL_TgpuComputePipeline).rawPipeline;
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

    throw new Error(`Unknown resource type: ${resource}`);
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
