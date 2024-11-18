import type { Parsed } from 'typed-binary';
import { onGPU } from '../../gpuMode';
import type { JitTranspiler } from '../../jitTranspiler';
import { WeakMemo } from '../../memo';
import { type PlumListener, PlumStore } from '../../plumStore';
import {
  ComputeProgramBuilder,
  type Program,
  RenderProgramBuilder,
} from '../../programBuilder';
import type { TgpuSettable } from '../../settableTrait';
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
import type { TgpuSampler } from '../../tgpuSampler';
import type { AnyTgpuData } from '../../types';
import { type TgpuBuffer, createBufferImpl, isBuffer } from '../buffer/buffer';
import {
  type INTERNAL_TgpuExternalTexture,
  INTERNAL_createExternalTexture,
  type TgpuExternalTexture,
  isExternalTexture,
} from '../texture/externalTexture';
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
import type {
  ComputePipelineExecutorOptions,
  ComputePipelineOptions,
  CreateTextureOptions,
  CreateTextureResult,
  ExperimentalTgpuRoot,
  RenderPipelineExecutorOptions,
  RenderPipelineOptions,
  SetPlumAction,
} from './rootTypes';

interface Disposable {
  destroy(): void;
}

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a root can interact via GPU buffers.
 */
class TgpuRootImpl implements ExperimentalTgpuRoot {
  private _disposables: Disposable[] = [];
  private _samplers = new WeakMap<TgpuSampler, GPUSampler>();

  private _unwrappedBindGroupLayouts = new WeakMemo(
    (key: TgpuBindGroupLayout) => key.unwrap(this),
  );
  private _unwrappedBindGroups = new WeakMemo((key: TgpuBindGroup) =>
    key.unwrap(this),
  );

  private _pipelineExecutors: PipelineExecutor[] = [];
  private _commandEncoder: GPUCommandEncoder | null = null;

  private readonly _plumStore = new PlumStore();

  constructor(
    public readonly device: GPUDevice,
    public readonly jitTranspiler: JitTranspiler | undefined,
  ) {}

  get commandEncoder() {
    if (!this._commandEncoder) {
      this._commandEncoder = this.device.createCommandEncoder();
    }

    return this._commandEncoder;
  }

  createBuffer<TData extends AnyTgpuData>(
    typeSchema: TData,
    initialOrBuffer?: Parsed<TData> | TgpuPlum<Parsed<TData>> | GPUBuffer,
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

  importExternalTexture<TColorSpace extends PredefinedColorSpace>(options: {
    source: HTMLVideoElement | VideoFrame;
    colorSpace?: TColorSpace;
  }): TgpuExternalTexture<{
    colorSpace: PredefinedColorSpace extends TColorSpace ? 'srgb' : TColorSpace;
  }> {
    return INTERNAL_createExternalTexture(
      this,
      options.source,
      options.colorSpace,
      // biome-ignore lint/suspicious/noExplicitAny: <too much type wrangling>
    ) as any;
  }

  destroy() {
    for (const disposable of this._disposables) {
      disposable.destroy();
    }
  }

  unwrap(resource: TgpuBuffer<AnyTgpuData>): GPUBuffer;
  unwrap(resource: TgpuBindGroupLayout): GPUBindGroupLayout;
  unwrap(resource: TgpuBindGroup): GPUBindGroup;
  unwrap(resource: TgpuTexture): GPUTexture;
  unwrap(
    resource:
      | TgpuReadonlyTexture
      | TgpuWriteonlyTexture
      | TgpuMutableTexture
      | TgpuSampledTexture,
  ): GPUTextureView;
  unwrap(resource: TgpuExternalTexture): GPUExternalTexture;
  unwrap(
    resource:
      | TgpuBuffer<AnyTgpuData>
      | TgpuBindGroupLayout
      | TgpuBindGroup
      | TgpuTexture
      | TgpuReadonlyTexture
      | TgpuWriteonlyTexture
      | TgpuMutableTexture
      | TgpuSampledTexture
      | TgpuExternalTexture,
  ):
    | GPUBuffer
    | GPUBindGroupLayout
    | GPUBindGroup
    | GPUTexture
    | GPUTextureView
    | GPUExternalTexture {
    if (isBuffer(resource)) {
      return resource.buffer;
    }

    if (isBindGroupLayout(resource)) {
      return this._unwrappedBindGroupLayouts.getOrMake(resource);
    }

    if (isBindGroup(resource)) {
      return this._unwrappedBindGroups.getOrMake(resource);
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

    if (isExternalTexture(resource)) {
      return (resource as unknown as INTERNAL_TgpuExternalTexture).unwrap();
    }

    throw new Error(`Unknown resource type: ${resource}`);
  }

  samplerFor(sampler: TgpuSampler): GPUSampler {
    let gpuSampler = this._samplers.get(sampler);

    if (!gpuSampler) {
      gpuSampler = this.device.createSampler(sampler.descriptor);

      if (!gpuSampler) {
        throw new Error(`Failed to create sampler for ${sampler}`);
      }
      this._samplers.set(sampler, gpuSampler);
    }

    return gpuSampler;
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

  makeRenderPipeline(options: RenderPipelineOptions): RenderPipelineExecutor {
    const { vertexProgram, fragmentProgram } = new RenderProgramBuilder(
      this,
      options.vertex.code,
      options.fragment.code,
      options.vertex.output,
    ).build({
      bindingGroup: (options.externalLayouts ?? []).length,
    });

    const vertexShaderModule = this.device.createShaderModule({
      code: vertexProgram.code,
    });
    const fragmentShaderModule = this.device.createShaderModule({
      code: fragmentProgram.code,
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: options.label ?? '',
      bindGroupLayouts: [
        ...(options.externalLayouts ?? []),
        vertexProgram.bindGroupResolver.getBindGroupLayout(),
        fragmentProgram.bindGroupResolver.getBindGroupLayout(),
      ],
    });

    const renderPipeline = this.device.createRenderPipeline({
      label: options.label ?? '',
      layout: pipelineLayout,
      vertex: {
        module: vertexShaderModule,
        buffers:
          vertexProgram.bindGroupResolver.getVertexBufferDescriptors() ?? [],
      },
      fragment: {
        module: fragmentShaderModule,
        targets: options.fragment?.target ?? [],
      },
      primitive: options.primitive,
    });

    const executor = new RenderPipelineExecutor(
      this,
      renderPipeline,
      vertexProgram,
      fragmentProgram,
      options.externalLayouts?.length ?? 0,
    );

    this._pipelineExecutors.push(executor);
    return executor;
  }

  makeComputePipeline(
    options: ComputePipelineOptions,
  ): ComputePipelineExecutor {
    const program = onGPU(() =>
      new ComputeProgramBuilder(
        this,
        options.code,
        options.workgroupSize ?? [1],
      ).build({
        bindingGroup: (options.externalLayouts ?? []).length,
      }),
    );

    const shaderModule = this.device.createShaderModule({
      code: program.code,
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: options.label ?? '',
      bindGroupLayouts: [
        ...(options.externalLayouts ?? []),
        program.bindGroupResolver.getBindGroupLayout(),
      ],
    });

    const computePipeline = this.device.createComputePipeline({
      label: options.label ?? '',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
      },
    });

    const executor = new ComputePipelineExecutor(
      this,
      computePipeline,
      [program],
      options.externalLayouts?.length ?? 0,
    );
    this._pipelineExecutors.push(executor);
    return executor;
  }

  flush() {
    if (!this._commandEncoder) {
      return;
    }

    this.device.queue.submit([this._commandEncoder.finish()]);
    this._commandEncoder = null;
  }
}

interface PipelineExecutor {
  execute(
    options: RenderPipelineExecutorOptions | ComputePipelineExecutorOptions,
  ): void;
}

class RenderPipelineExecutor implements PipelineExecutor {
  constructor(
    private root: ExperimentalTgpuRoot,
    private pipeline: GPURenderPipeline,
    private vertexProgram: Program,
    private fragmentProgram: Program,
    private externalLayoutCount: number,
    private label?: string,
  ) {}

  execute(options: RenderPipelineExecutorOptions) {
    const {
      vertexCount,
      instanceCount,
      firstVertex,
      firstInstance,
      externalBindGroups,
      ...descriptor
    } = options;

    if ((externalBindGroups?.length ?? 0) !== this.externalLayoutCount) {
      throw new Error(
        `External bind group count doesn't match the external bind group layout configuration. Expected ${this.externalLayoutCount}, got: ${externalBindGroups?.length ?? 0}`,
      );
    }

    const passEncoder = this.root.commandEncoder.beginRenderPass({
      ...descriptor,
      label: this.label ?? '',
    });
    passEncoder.setPipeline(this.pipeline);

    (externalBindGroups ?? []).forEach((group, index) =>
      passEncoder.setBindGroup(index, group),
    );

    passEncoder.setBindGroup(
      (externalBindGroups ?? []).length,
      this.vertexProgram.bindGroupResolver.getBindGroup(),
    );
    passEncoder.setBindGroup(
      (externalBindGroups ?? []).length + 1,
      this.fragmentProgram.bindGroupResolver.getBindGroup(),
    );

    for (const [
      usage,
      index,
    ] of this.vertexProgram.bindGroupResolver.getVertexBuffers()) {
      passEncoder.setVertexBuffer(
        index,
        (usage.allocatable as TgpuBuffer<AnyTgpuData>).buffer,
      );
    }

    passEncoder.draw(vertexCount, instanceCount, firstVertex, firstInstance);
    passEncoder.end();
  }
}

class ComputePipelineExecutor implements PipelineExecutor {
  constructor(
    private root: ExperimentalTgpuRoot,
    private pipeline: GPUComputePipeline,
    private programs: Program[],
    private externalLayoutCount: number,
    private label?: string,
  ) {}

  execute(options?: ComputePipelineExecutorOptions) {
    const { workgroups = [1, 1], externalBindGroups } = options ?? {};

    if ((externalBindGroups?.length ?? 0) !== this.externalLayoutCount) {
      throw new Error(
        `External bind group count doesn't match the external bind group layout configuration. Expected ${this.externalLayoutCount}, got: ${externalBindGroups?.length ?? 0}`,
      );
    }

    const passEncoder = this.root.commandEncoder.beginComputePass({
      label: this.label ?? '',
    });
    passEncoder.setPipeline(this.pipeline);

    (externalBindGroups ?? []).forEach((group, index) =>
      passEncoder.setBindGroup(index, group),
    );

    this.programs.forEach((program, i) =>
      passEncoder.setBindGroup(
        (externalBindGroups ?? []).length + i,
        program.bindGroupResolver.getBindGroup(),
      ),
    );
    passEncoder.dispatchWorkgroups(...workgroups);
    passEncoder.end();
  }
}

/**
 * Options passed into {@link init}.
 */
export type InitOptions = {
  adapter?: GPURequestAdapterOptions | undefined;
  device?: GPUDeviceDescriptor | undefined;
  unstable_jitTranspiler?: JitTranspiler | undefined;
};

/**
 * Options passed into {@link initFromDevice}.
 */
export type InitFromDeviceOptions = {
  device: GPUDevice;
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
export async function init(
  options?: InitOptions,
): Promise<ExperimentalTgpuRoot> {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported by this browser.');
  }

  const adapter = await navigator.gpu.requestAdapter(options?.adapter);

  if (!adapter) {
    throw new Error('Could not find a compatible GPU');
  }

  return new TgpuRootImpl(
    await adapter.requestDevice(options?.device),
    options?.unstable_jitTranspiler,
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
export function initFromDevice(
  options: InitFromDeviceOptions,
): ExperimentalTgpuRoot {
  return new TgpuRootImpl(options.device, options.unstable_jitTranspiler);
}
