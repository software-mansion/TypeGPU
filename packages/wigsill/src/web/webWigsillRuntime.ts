import { BufferReader, BufferWriter, type Parsed } from 'typed-binary';
import type { SimpleWgslData } from '../data';
import { roundUp } from '../mathUtils';
import {
  ComputeProgramBuilder,
  type Program,
  RenderProgramBuilder,
} from '../programBuilder';
import { TaskQueue } from '../taskQueue';
import type { AnyWgslData, WgslAllocatable } from '../types';
import type { WgslCode } from '../wgslCode';
import type { WgslSampler } from '../wgslSampler';
import type { WgslTextureExternal, WgslTextureView } from '../wgslTexture';
import type { WigsillRuntime } from '../wigsillRuntime';
import { deriveVertexFormat } from '../wigsillRuntime';

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a runtime can interact via GPU buffers.
 */
class WebWigsillRuntime {
  private _entryToBufferMap = new Map<WgslAllocatable, GPUBuffer>();
  private _samplers = new WeakMap<WgslSampler, GPUSampler>();
  private _textures = new WeakMap<WgslTextureView, GPUTexture>();
  private _pipelineExecutors: PipelineExecutor<
    GPURenderPipeline | GPUComputePipeline
  >[] = [];

  // Used for reading GPU buffers ad hoc.
  private _readBuffer: GPUBuffer | null = null;
  private _taskQueue = new TaskQueue();

  constructor(public readonly device: GPUDevice) {}

  dispose() {
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
      });

      if (!buffer) {
        throw new Error(`Failed to create buffer for ${allocatable}`);
      }
      this._entryToBufferMap.set(allocatable, buffer);
    }

    return buffer;
  }

  textureFor(view: WgslTextureView): GPUTextureView {
    let texture = this._textures.get(view);

    if (!texture) {
      texture = this.device.createTexture(view.texture.descriptor);

      if (!texture) {
        throw new Error(`Failed to create texture for ${view}`);
      }
      this._textures.set(view, texture);
    }

    return texture.createView(view.descriptor);
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
      const mappedBuffer = this._readBuffer.getMappedRange().slice(0);

      const res = allocatable.dataType.read(
        new BufferReader(mappedBuffer),
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

  makeRenderPipeline(options: {
    vertex: {
      code: WgslCode;
      output: {
        [K in symbol]: string;
      } & {
        [K in string]: [AnyWgslData, string];
      };
    };
    fragment: {
      code: WgslCode;
      target: Iterable<GPUColorTargetState | null>;
    };
    primitive: GPUPrimitiveState;
    label?: string;
  }): RenderPipelineExecutor {
    const [vertexProgram, fragmentProgram, vertexBuffers] =
      new RenderProgramBuilder(
        this,
        options.vertex.code,
        options.fragment.code,
        options.vertex.output,
      ).build({
        bindingGroup: 0,
      });

    const vertexBufferDescriptors = vertexBuffers.map((buffer, idx) => {
      if (!buffer.allocatable.vertexLayout) {
        throw new Error(
          `Buffer ${buffer.allocatable} does not have a vertex layout`,
        );
      }
      return {
        ...buffer.allocatable.vertexLayout,
        attributes: [
          {
            shaderLocation: idx,
            offset: 0,
            format: deriveVertexFormat(
              buffer.allocatable.dataType as SimpleWgslData<AnyWgslData>,
            ),
          },
        ],
      };
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
        vertexProgram.bindGroupLayout,
        fragmentProgram.bindGroupLayout,
      ],
    });

    const renderPipeline = this.device.createRenderPipeline({
      label: options.label ?? '',
      layout: pipelineLayout,
      vertex: {
        module: vertexShaderModule,
        buffers: vertexBufferDescriptors,
      },
      fragment: {
        module: fragmentShaderModule,
        targets: options.fragment?.target ?? [],
      },
      primitive: options.primitive,
    });

    const buffers = vertexBuffers.map(
      (buffer, idx) => [this.bufferFor(buffer.allocatable), idx] as const,
    );

    const executor = new RenderPipelineExecutor(
      this.device,
      renderPipeline,
      vertexProgram,
      fragmentProgram,
      0,
      buffers,
    );

    this._pipelineExecutors.push(executor);
    return executor;
  }

  makeComputePipeline(options: {
    workgroupSize: [number, number?, number?];
    code: WgslCode;
    label?: string;
  }) {
    const program = new ComputeProgramBuilder(
      this,
      options.code,
      options.workgroupSize,
    ).build({
      bindingGroup: 0,
    });

    const shaderModule = this.device.createShaderModule({
      code: program.code,
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: options.label ?? '',
      bindGroupLayouts: [program.bindGroupLayout],
    });

    const computePipeline = this.device.createComputePipeline({
      label: options.label ?? '',
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
      },
    });

    const executor = new ComputePipelineExecutor(
      this.device,
      computePipeline,
      [program],
      0,
    );
    this._pipelineExecutors.push(executor);
    return executor;
  }

  flush() {
    this.device.queue.submit(
      this._pipelineExecutors
        .map((executor) => executor.flush())
        .filter((encoded): encoded is GPUCommandBuffer => !!encoded),
    );
  }
}

class PipelineExecutor<T extends GPURenderPipeline | GPUComputePipeline> {
  public commandEncoder: GPUCommandEncoder | undefined;

  constructor(
    public device: GPUDevice,
    public pipeline: T,
    public programs: Program[],
    public externalLayoutCount: number,
    protected label?: string,
  ) {}

  flush() {
    const commandBuffer = this.commandEncoder?.finish();
    this.commandEncoder = undefined;
    return commandBuffer;
  }
}

class RenderPipelineExecutor extends PipelineExecutor<GPURenderPipeline> {
  private _vertexProgram: Program;
  private _fragmentProgram: Program;
  private _usedVertexBuffers: Set<readonly [GPUBuffer, number]>;

  constructor(
    device: GPUDevice,
    pipeline: GPURenderPipeline,
    vertexProgram: Program,
    fragmentProgram: Program,
    externalLayoutCount: number,
    usedVertexBuffers: (readonly [GPUBuffer, number])[],
  ) {
    super(
      device,
      pipeline,
      [vertexProgram, fragmentProgram],
      externalLayoutCount,
    );
    this._vertexProgram = vertexProgram;
    this._fragmentProgram = fragmentProgram;
    this._usedVertexBuffers = new Set(usedVertexBuffers);
  }
  execute(
    options: GPURenderPassDescriptor & {
      vertexCount: number;
      instanceCount?: number;
      firstVertex?: number;
      firstInstance?: number;
      externalBindGroups?: GPUBindGroup[];
      externalVertexBuffers?: GPUBuffer[];
    },
  ) {
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

    if (!this.commandEncoder) {
      this.commandEncoder = this.device.createCommandEncoder({
        label: this.label ?? '',
      });
    }

    const passEncoder = this.commandEncoder.beginRenderPass({
      ...descriptor,
      label: this.label ?? '',
    });
    passEncoder.setPipeline(this.pipeline);

    (externalBindGroups ?? []).forEach((group, index) =>
      passEncoder.setBindGroup(index, group),
    );

    passEncoder.setBindGroup(
      (externalBindGroups ?? []).length,
      this._vertexProgram.bindGroup,
    );
    passEncoder.setBindGroup(
      (externalBindGroups ?? []).length + 1,
      this._fragmentProgram.bindGroup,
    );

    for (const [buffer, index] of this._usedVertexBuffers) {
      passEncoder.setVertexBuffer(index, buffer);
    }

    passEncoder.draw(vertexCount, instanceCount, firstVertex, firstInstance);
    passEncoder.end();
  }
}

class ComputePipelineExecutor extends PipelineExecutor<GPUComputePipeline> {
  execute(workgroupCounts: [number, number?, number?]) {
    if (!this.commandEncoder) {
      this.commandEncoder = this.device.createCommandEncoder({
        label: this.label ?? '',
      });
    }

    const passEncoder = this.commandEncoder.beginComputePass({
      label: this.label ?? '',
    });
    passEncoder.setPipeline(this.pipeline);
    this.programs.forEach((program, i) =>
      passEncoder.setBindGroup(i, program.bindGroup),
    );
    passEncoder.dispatchWorkgroups(...workgroupCounts);
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
): Promise<WigsillRuntime> {
  if (options instanceof GPUDevice) {
    return new WebWigsillRuntime(options);
  }

  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported by this browser.');
  }

  const adapter = await navigator.gpu.requestAdapter(options?.adapter);

  if (!adapter) {
    throw new Error('Could not find a compatible GPU');
  }

  return new WebWigsillRuntime(await adapter.requestDevice(options?.device));
}
