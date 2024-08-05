import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import { roundUp } from './mathUtils';
import { PlumStore } from './plumStore';
import ProgramBuilder, { type Program } from './programBuilder';
import type { WgslSettable } from './settableTrait';
import { TaskQueue } from './taskQueue';
import type {
  ComputePipelineExecutorOptions,
  ComputePipelineOptions,
  RenderPipelineExecutorOptions,
  RenderPipelineOptions,
  TypeGpuRuntime,
} from './typegpuRuntime';
import type { AnyWgslData, WgslAllocatable } from './types';
import { code } from './wgslCode';
import {
  type ExtractPlumValue,
  type Unsubscribe,
  type WgslPlum,
  isPlum,
} from './wgslPlum';

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a runtime can interact via GPU buffers.
 */
class TypeGpuRuntimeImpl {
  private _entryToBufferMap = new Map<WgslAllocatable, GPUBuffer>();
  private _pipelineExecutors: PipelineExecutor<
    GPURenderPipeline | GPUComputePipeline
  >[] = [];
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

  copyBuffer<TData extends AnyWgslData>(
    source: WgslAllocatable<TData>,
    destination: WgslAllocatable<TData>,
    mask?: Parsed<TData>,
  ) {
    const sourceBuffer = this.bufferFor(source);
    const destinationBuffer = this.bufferFor(destination);

    const size = roundUp(source.dataType.size, source.dataType.byteAlignment);

    if (mask) {
      const hostBuffer = new ArrayBuffer(size);
      source.dataType.write(new BufferWriter(hostBuffer), mask);
      const readBuffer = new Uint8Array(hostBuffer);
      console.log(readBuffer);
      const chunks: number[] = [];
      const toCopy: { offset: number; size: number }[] = [];

      let chunkIndex = 0;
      while (chunkIndex < size / 4) {
        let isZero = true;
        for (let i = 0; i < 4; i++) {
          if (readBuffer[chunkIndex * 4 + i] !== 0) {
            isZero = false;
            break;
          }
        }
        if (!isZero) {
          chunks.push(chunkIndex);
        }
        chunkIndex++;
      }

      chunkIndex = 0;
      while (chunkIndex < chunks.length) {
        const start = chunks[chunkIndex];
        if (start === undefined) break;
        let end = start;
        while (chunks[chunkIndex] === end) {
          end++;
          chunkIndex++;
        }
        toCopy.push({
          offset: start * 4,
          size: (end - start) * 4,
        });
      }

      const commandEncoder = this.device.createCommandEncoder();
      for (const { offset, size } of toCopy) {
        commandEncoder.copyBufferToBuffer(
          sourceBuffer,
          offset,
          destinationBuffer,
          offset,
          size,
        );
      }
      this.device.queue.submit([commandEncoder.finish()]);
    } else {
      const commandEncoder = this.device.createCommandEncoder();
      commandEncoder.copyBufferToBuffer(
        sourceBuffer,
        0,
        destinationBuffer,
        0,
        size,
      );
      this.device.queue.submit([commandEncoder.finish()]);
    }
  }

  readPlum<TPlum extends WgslPlum>(plum: TPlum): ExtractPlumValue<TPlum> {
    return this._plumStore.get(plum);
  }

  setPlum<TPlum extends WgslPlum & WgslSettable>(
    plum: TPlum,
    value: ExtractPlumValue<TPlum>,
  ) {
    this._plumStore.set(plum, value);
  }

  onPlumChange<TValue>(
    plum: WgslPlum<TValue>,
    listener: () => unknown,
  ): Unsubscribe {
    return this._plumStore.subscribe(plum, listener);
  }

  makeRenderPipeline(options: RenderPipelineOptions): RenderPipelineExecutor {
    const vertexProgram = new ProgramBuilder(
      this,
      code`
        @vertex fn main_vertex(${options.vertex.args.flatMap((arg) => [arg, ', '])}) -> ${options.vertex.output} {
          ${options.vertex.code}
        }

        ${options.externalDeclarations?.flatMap((arg) => [arg, '\n']) ?? ''}
      `,
    ).build({
      bindingGroup: (options.externalLayouts ?? []).length,
      shaderStage: GPUShaderStage.VERTEX,
    });

    const fragmentProgram = new ProgramBuilder(
      this,
      code`
        @fragment fn main_frag(${options.fragment.args.flatMap((arg) => [arg, ', '])}) -> ${options.fragment.output} {
          ${options.fragment.code}
        }

        ${options.externalDeclarations?.flatMap((arg) => [arg, '\n']) ?? ''}
      `,
    ).build({
      bindingGroup: (options.externalLayouts ?? []).length + 1,
      shaderStage: GPUShaderStage.FRAGMENT,
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
        vertexProgram.bindGroupLayout,
        fragmentProgram.bindGroupLayout,
      ],
    });

    const renderPipeline = this.device.createRenderPipeline({
      label: options.label ?? '',
      layout: pipelineLayout,
      vertex: {
        module: vertexShaderModule,
        buffers: options.vertex.buffersLayouts ?? [],
      },
      fragment: {
        module: fragmentShaderModule,
        targets: options.fragment.target ?? [],
      },
      primitive: options.primitive,
    });

    const executor = new RenderPipelineExecutor(
      this,
      renderPipeline,
      [vertexProgram, fragmentProgram],
      options.externalLayouts?.length ?? 0,
    );

    this._pipelineExecutors.push(executor);
    return executor;
  }

  makeComputePipeline(
    options: ComputePipelineOptions,
  ): ComputePipelineExecutor {
    const { args = [], workgroupSize = [1, 1] } = options;

    const program = new ProgramBuilder(
      this,
      code`
        @compute @workgroup_size(${workgroupSize.join(', ')}) fn main_compute(${args.flatMap((arg) => [arg, ', '])}) {
          ${options.code}
        }

        ${options.externalDeclarations?.flatMap((arg) => [arg, '\n']) ?? ''}
      `,
    ).build({
      bindingGroup: (options.externalLayouts ?? []).length,
      shaderStage: GPUShaderStage.COMPUTE,
    });

    const shaderModule = this.device.createShaderModule({
      code: program.code,
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: options.label ?? '',
      bindGroupLayouts: [
        ...(options.externalLayouts ?? []),
        program.bindGroupLayout,
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

class PipelineExecutor<T extends GPURenderPipeline | GPUComputePipeline> {
  constructor(
    protected _runtime: TypeGpuRuntime,
    public pipeline: T,
    public programs: Program[],
    public externalLayoutCount: number,
    protected label?: string,
  ) {}
}

class RenderPipelineExecutor extends PipelineExecutor<GPURenderPipeline> {
  execute(options: RenderPipelineExecutorOptions) {
    const {
      vertexCount,
      instanceCount,
      firstVertex,
      firstInstance,
      externalBindGroups,
      externalVertexBuffers,
      ...descriptor
    } = options;

    if ((externalBindGroups?.length ?? 0) !== this.externalLayoutCount) {
      throw new Error(
        `External bind group count doesn't match the external bind group layout configuration. Expected ${this.externalLayoutCount}, got: ${externalBindGroups?.length ?? 0}`,
      );
    }

    const passEncoder = this._runtime.commandEncoder.beginRenderPass({
      ...descriptor,
      label: this.label ?? '',
    });
    passEncoder.setPipeline(this.pipeline);

    (externalBindGroups ?? []).forEach((group, index) =>
      passEncoder.setBindGroup(index, group),
    );

    (externalVertexBuffers ?? []).forEach((group, index) =>
      passEncoder.setVertexBuffer(index, group),
    );

    this.programs.forEach((program, i) => {
      passEncoder.setBindGroup(
        (externalBindGroups ?? []).length + i,
        program.bindGroup,
      );
    });

    passEncoder.draw(vertexCount, instanceCount, firstVertex, firstInstance);
    passEncoder.end();
  }
}

class ComputePipelineExecutor extends PipelineExecutor<GPUComputePipeline> {
  execute(options?: ComputePipelineExecutorOptions) {
    const { workgroups = [1, 1], externalBindGroups } = options ?? {};

    if ((externalBindGroups?.length ?? 0) !== this.externalLayoutCount) {
      throw new Error(
        `External bind group count doesn't match the external bind group layout configuration. Expected ${this.externalLayoutCount}, got: ${externalBindGroups?.length ?? 0}`,
      );
    }

    const passEncoder = this._runtime.commandEncoder.beginComputePass({
      label: this.label ?? '',
    });
    passEncoder.setPipeline(this.pipeline);

    (externalBindGroups ?? []).forEach((group, index) =>
      passEncoder.setBindGroup(index, group),
    );

    this.programs.forEach((program, i) =>
      passEncoder.setBindGroup(
        (externalBindGroups ?? []).length + i,
        program.bindGroup,
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
  if (options instanceof GPUDevice) {
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
