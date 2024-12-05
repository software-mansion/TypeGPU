import type { OmitBuiltins } from '../../builtin';
import type { AnyData } from '../../data/dataTypes';
import type { JitTranspiler } from '../../jitTranspiler';
import { WeakMemo } from '../../memo';
import {
  type NameRegistry,
  RandomNameRegistry,
  StrictNameRegistry,
} from '../../nameRegistry';
import { type PlumListener, PlumStore } from '../../plumStore';
import type { TgpuSettable } from '../../settableTrait';
import type { Infer } from '../../shared/repr';
import type { AnyVertexAttribs } from '../../shared/vertexFormat';
import type {
  TgpuBindGroup,
  TgpuBindGroupLayout,
} from '../../tgpuBindGroupLayout';
import { isBindGroup, isBindGroupLayout } from '../../tgpuBindGroupLayout';
import type {
  ExtractPlumValue,
  TgpuPlum,
  Unsubscribe,
} from '../../tgpuPlumTypes';
import type { TgpuSlot } from '../../types';
import { type TgpuBuffer, createBufferImpl, isBuffer } from '../buffer/buffer';
import type { IOLayout } from '../function/fnTypes';
import type { TgpuComputeFn } from '../function/tgpuComputeFn';
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
  type INTERNAL_TgpuSampledTexture,
  type INTERNAL_TgpuStorageTexture,
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
  SetPlumAction,
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

  with<T>(slot: TgpuSlot<T>, value: T): WithBinding {
    return new WithBindingImpl(this._getRoot, [
      ...this._slotBindings,
      [slot, value],
    ]);
  }

  withCompute(entryFn: TgpuComputeFn): WithCompute {
    return new WithComputeImpl(this._getRoot(), this._slotBindings, entryFn);
  }

  withVertex<Attribs extends IOLayout, Varying extends IOLayout>(
    vertexFn: TgpuVertexFn,
    attribs: LayoutToAllowedAttribs<OmitBuiltins<Attribs>>,
  ): WithVertex {
    return new WithVertexImpl({
      branch: this._getRoot(),
      primitiveState: undefined,
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
    fragmentFn: TgpuFragmentFn,
    targets: AnyFragmentTargets,
  ): WithFragment {
    return new WithFragmentImpl({
      ...this._options,
      fragmentFn,
      targets,
    });
  }
}

class WithFragmentImpl implements WithFragment {
  constructor(private readonly _options: RenderPipelineCoreOptions) {}

  withPrimitive(primitiveState: GPUPrimitiveState): WithFragment {
    return new WithFragmentImpl({ ...this._options, primitiveState });
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
class TgpuRootImpl extends WithBindingImpl implements ExperimentalTgpuRoot {
  private _disposables: Disposable[] = [];

  private _unwrappedBindGroupLayouts = new WeakMemo(
    (key: TgpuBindGroupLayout) => key.unwrap(this),
  );
  private _unwrappedBindGroups = new WeakMemo((key: TgpuBindGroup) =>
    key.unwrap(this),
  );

  private _commandEncoder: GPUCommandEncoder | null = null;

  private readonly _plumStore = new PlumStore();

  constructor(
    public readonly device: GPUDevice,
    public readonly nameRegistry: NameRegistry,
    public readonly jitTranspiler: JitTranspiler | undefined,
  ) {
    super(() => this, []);
  }

  get commandEncoder() {
    if (!this._commandEncoder) {
      this._commandEncoder = this.device.createCommandEncoder();
    }

    return this._commandEncoder;
  }

  createBuffer<TData extends AnyData>(
    typeSchema: TData,
    initialOrBuffer?: Infer<TData> | TgpuPlum<Infer<TData>> | GPUBuffer,
  ): TgpuBuffer<TData> {
    const buffer = createBufferImpl(this, typeSchema, initialOrBuffer).$device(
      this.device,
    );

    this._disposables.push(buffer);

    return buffer;
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

  destroy() {
    for (const disposable of this._disposables) {
      disposable.destroy();
    }
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
      return (resource as unknown as INTERNAL_TgpuStorageTexture).unwrap();
    }

    if (isSampledTextureView(resource)) {
      return (resource as unknown as INTERNAL_TgpuSampledTexture).unwrap();
    }

    throw new Error(`Unknown resource type: ${resource}`);
  }

  readPlum<TPlum extends TgpuPlum>(plum: TPlum): ExtractPlumValue<TPlum> {
    return this._plumStore.get(plum);
  }

  setPlum<TPlum extends TgpuPlum & TgpuSettable>(
    plum: TPlum,
    value: SetPlumAction<ExtractPlumValue<TPlum>>,
  ) {
    type Value = ExtractPlumValue<TPlum>;

    if (typeof value === 'function') {
      const compute = value as (prev: Value) => Value;
      this._plumStore.set(plum, compute(this._plumStore.get(plum)));
    } else {
      this._plumStore.set(plum, value);
    }
  }

  onPlumChange<TValue>(
    plum: TgpuPlum<TValue>,
    listener: PlumListener<TValue>,
  ): Unsubscribe {
    return this._plumStore.subscribe(plum, listener);
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
  );
}
