import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import { roundUp } from './mathUtils';
import { type PlumListener, PlumStore } from './plumStore';
import {
  ComputeProgramBuilder,
  type Program,
  RenderProgramBuilder,
} from './programBuilder';
import type { WgslSettable } from './settableTrait';
import { TaskQueue } from './taskQueue';
import type {
  ComputePipelineExecutorOptions,
  ComputePipelineOptions,
  RenderPipelineExecutorOptions,
  RenderPipelineOptions,
  SetPlumAction,
  TypeGpuRuntime,
} from './typegpuRuntime';
import type { AnyWgslData, WgslAllocatable } from './types';
import {
  type ExtractPlumValue,
  type Unsubscribe,
  type WgslPlum,
  isPlum,
} from './wgslPlum';
import type { WgslSampler } from './wgslSampler';
import type {
  WgslAnyTexture,
  WgslAnyTextureView,
  WgslTextureExternal,
} from './wgslTexture';

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a runtime can interact via GPU buffers.
 */
class TypeGpuRuntimeImpl {
  private _entryToBufferMap = new Map<WgslAllocatable, GPUBuffer>();
  private _samplers = new WeakMap<WgslSampler, GPUSampler>();
  private _textures = new WeakMap<WgslAnyTexture, GPUTexture>();
  private _textureViews = new WeakMap<WgslAnyTextureView, GPUTextureView>();
  private _pipelineExecutors: PipelineExecutor[] = [];
  private _commandEncoder: GPUCommandEncoder | null = null;

  // Used for reading GPU buffers ad hoc.
  private _readBuffer: GPUBuffer | null = null;
  private _taskQueue = new TaskQueue();
  private readonly _plumStore = new PlumStore();
  private readonly _allocSubscriptions = new Map<
    WgslAllocatable,
    Unsubscribe
  >();

  constructor(public readonly device: GPUDevice) {}

  get commandEncoder() {
    if (!this._commandEncoder) {
      this._commandEncoder = this.device.createCommandEncoder();
    }

    return this._commandEncoder;
  }

  dispose() {
    for (const unsub of this._allocSubscriptions.values()) {
      unsub();
    }
    this._allocSubscriptions.clear();

    for (const buffer of this._entryToBufferMap.values()) {
      buffer.destroy();
    }

    this._entryToBufferMap.clear();

    this._readBuffer?.destroy();
  }

  bufferFor(allocatable: WgslAllocatable) {
    let buffer = this._entryToBufferMap.get(allocatable);

    if (!buffer) {
      buffer = this.device.createBuffer({
        usage: allocatable.flags,
        size: roundUp(
          allocatable.dataType.size,
          allocatable.dataType.byteAlignment,
        ),
        mappedAtCreation: allocatable.initial !== undefined,
      });

      if (!buffer) {
        throw new Error(`Failed to create buffer for ${allocatable}`);
      }

      if (allocatable.initial !== undefined) {
        const writer = new BufferWriter(buffer.getMappedRange());

        if (isPlum(allocatable.initial)) {
          const plum = allocatable.initial;

          allocatable.dataType.write(writer, this._plumStore.get(plum));

          this._allocSubscriptions.set(
            allocatable,
            this._plumStore.subscribe(plum, () => {
              this.writeBuffer(allocatable, this._plumStore.get(plum));
            }),
          );
        } else {
          allocatable.dataType.write(writer, allocatable.initial);
        }

        buffer.unmap();
      }

      this._entryToBufferMap.set(allocatable, buffer);
    }

    return buffer;
  }

  textureFor(view: WgslAnyTexture | WgslAnyTextureView): GPUTexture {
    let source: WgslAnyTexture;
    if ('texture' in view) {
      source = view.texture;
    } else {
      source = view;
    }

    let texture = this._textures.get(source);

    if (!texture) {
      const descriptor = {
        ...source.descriptor,
        usage: source.flags,
      } as GPUTextureDescriptor;
      texture = this.device.createTexture(descriptor);

      if (!texture) {
        throw new Error(`Failed to create texture for ${view}`);
      }
      this._textures.set(source, texture);
    }

    return texture;
  }

  viewFor(view: WgslAnyTextureView): GPUTextureView {
    let textureView = this._textureViews.get(view);
    if (!textureView) {
      textureView = this.textureFor(view.texture).createView(view.descriptor);
      this._textureViews.set(view, textureView);
    }
    return textureView;
  }

  externalTextureFor(texture: WgslTextureExternal): GPUExternalTexture {
    return this.device.importExternalTexture(texture.descriptor);
  }

  samplerFor(sampler: WgslSampler): GPUSampler {
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

  async readBuffer<TData extends AnyWgslData>(
    allocatable: WgslAllocatable<TData>,
  ): Promise<Parsed<TData>> {
    return this._taskQueue.enqueue(async () => {
      // Flushing any commands to be encoded.
      this.flush();

      if (
        !this._readBuffer ||
        this._readBuffer.size < allocatable.dataType.size
      ) {
        // destroying the previous buffer
        this._readBuffer?.destroy();

        this._readBuffer = this.device.createBuffer({
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          size: allocatable.dataType.size,
        });
      }

      const buffer = this.bufferFor(allocatable);
      const commandEncoder = this.device.createCommandEncoder();
      commandEncoder.copyBufferToBuffer(
        buffer,
        0,
        this._readBuffer,
        0,
        allocatable.dataType.size,
      );

      this.device.queue.submit([commandEncoder.finish()]);
      await this.device.queue.onSubmittedWorkDone();
      await this._readBuffer.mapAsync(
        GPUMapMode.READ,
        0,
        allocatable.dataType.size,
      );

      const res = allocatable.dataType.read(
        new BufferReader(this._readBuffer.getMappedRange()),
      ) as Parsed<TData>;

      this._readBuffer.unmap();

      return res;
    });
  }

  writeBuffer<TValue extends AnyWgslData>(
    allocatable: WgslAllocatable<TValue>,
    data: Parsed<TValue>,
  ) {
    const gpuBuffer = this.bufferFor(allocatable);

    const size = roundUp(
      allocatable.dataType.size,
      allocatable.dataType.byteAlignment,
    );

    const hostBuffer = new ArrayBuffer(size);
    allocatable.dataType.write(new BufferWriter(hostBuffer), data);
    this.device.queue.writeBuffer(gpuBuffer, 0, hostBuffer, 0, size);
  }

  readPlum<TPlum extends WgslPlum>(plum: TPlum): ExtractPlumValue<TPlum> {
    return this._plumStore.get(plum);
  }

  setPlum<TPlum extends WgslPlum & WgslSettable>(
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
    plum: WgslPlum<TValue>,
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
        targets: options.fragment?.targets ?? [],
      },
      primitive: options.primitive,
    });

    const executor = new RenderPipelineExecutor(
      this,
      renderPipeline,
      vertexProgram,
      fragmentProgram,
      options.externalLayouts?.length ?? 0,
      options.vertex.defaultVertexCount,
      options.label,
    );

    this._pipelineExecutors.push(executor);
    return executor;
  }

  makeComputePipeline(
    options: ComputePipelineOptions,
  ): ComputePipelineExecutor {
    const program = new ComputeProgramBuilder(
      this,
      options.code,
      options.workgroupSize ?? [1],
    ).build({
      bindingGroup: (options.externalLayouts ?? []).length,
    });

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
    private runtime: TypeGpuRuntime,
    private pipeline: GPURenderPipeline,
    private vertexProgram: Program,
    private fragmentProgram: Program,
    private externalLayoutCount: number,
    private defaultVertexCount?: number,
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

    const passEncoder = this.runtime.commandEncoder.beginRenderPass({
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
      buffer,
      index,
    ] of this.vertexProgram.bindGroupResolver.getVertexBuffers()) {
      passEncoder.setVertexBuffer(
        index,
        this.runtime.bufferFor(buffer.allocatable),
      );
    }

    if (vertexCount === undefined && this.defaultVertexCount === undefined) {
      throw new Error(
        `Neither defaultVertexCount in RenderPipelineOptions nor vertexCount in RenderPipelineExecutorOptions provided for pipeline: ${options.label ?? '<unnamed>'}`,
      );
    }

    passEncoder.draw(
      // biome-ignore lint/style/noNonNullAssertion: asserted via if statement above
      (vertexCount ?? this.defaultVertexCount)!,
      instanceCount,
      firstVertex,
      firstInstance,
    );
    passEncoder.end();
  }
}

class ComputePipelineExecutor implements PipelineExecutor {
  constructor(
    private runtime: TypeGpuRuntime,
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

    const passEncoder = this.runtime.commandEncoder.beginComputePass({
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
 * Options passed into {@link createRuntime}.
 */
export type CreateRuntimeOptions = {
  adapter: GPURequestAdapterOptions | undefined;
  device: GPUDeviceDescriptor | undefined;
};

/**
 * @param options
 * @returns
 *
 * @example
 * When given no options, the function will ask the browser for a suitable GPU device.
 * ```ts
 * createRuntime();
 * ```
 *
 * @example
 * If there are specific options that should be used when requesting a device, you can pass those in.
 * ```ts
 * const adapterOptions: GPURequestAdapterOptions = ...;
 * const deviceDescriptor: GPUDeviceDescriptor = ...;
 * createRuntime({ adapter: adapterOptions, device: deviceDescriptor });
 * ```
 *
 * @example
 * If a specific device should be used instead, it can be passed in as a parameter.
 * ```ts
 * const device: GPUDevice = ...;
 * createRuntime(device);
 * ```
 */
export async function createRuntime(
  options?: CreateRuntimeOptions | GPUDevice,
): Promise<TypeGpuRuntime> {
  if (doesResembleDevice(options)) {
    return new TypeGpuRuntimeImpl(options);
  }

  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported by this browser.');
  }

  const adapter = await navigator.gpu.requestAdapter(options?.adapter);

  if (!adapter) {
    throw new Error('Could not find a compatible GPU');
  }

  return new TypeGpuRuntimeImpl(await adapter.requestDevice(options?.device));
}

function doesResembleDevice(value: unknown): value is GPUDevice {
  return (
    !!value &&
    typeof value === 'object' &&
    'createBuffer' in value &&
    'queue' in value
  );
}
