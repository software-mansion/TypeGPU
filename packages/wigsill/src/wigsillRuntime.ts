import type { AnySchema } from 'typed-binary';
import ProgramBuilder, {
  type Program,
  RenderProgramBuilder,
} from './programBuilder';
import type { SimpleWgslData } from './std140';
import type { AnyWgslData } from './std140/types';
import type { Wgsl, WgslAllocatable } from './types';
import { type WgslCode, code } from './wgslCode';
import { roundUp } from './mathUtils';

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a runtime can interact via GPU buffers.
 */
class WigsillRuntime {
  private _entryToBufferMap = new WeakMap<WgslAllocatable, GPUBuffer>();
  private _readBuffer: GPUBuffer | null = null;
  private _taskQueue = new TaskQueue();
  private _pipelineExecutors: PipelineExecutor<
    GPURenderPipeline | GPUComputePipeline
  >[] = [];

  constructor(public readonly device: GPUDevice) {}

  dispose() {
    // TODO: Clean up all buffers
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

  async valueFor(memory: WgslAllocatable): Promise<ArrayBuffer> {
    return this._taskQueue.enqueue(async () => {
      if (!this._readBuffer || this._readBuffer.size < memory.dataType.size) {
        // destroying the previous buffer
        this._readBuffer?.destroy();

        this._readBuffer = this.device.createBuffer({
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          size: memory.dataType.size,
        });
      }

      const buffer = this.bufferFor(memory);
      const commandEncoder = this.device.createCommandEncoder();
      commandEncoder.copyBufferToBuffer(
        buffer,
        0,
        this._readBuffer,
        0,
        memory.dataType.size,
      );
      this.device.queue.submit([commandEncoder.finish()]);
      await this.device.queue.onSubmittedWorkDone();
      await this._readBuffer.mapAsync(GPUMapMode.READ, 0, memory.dataType.size);
      const value = this._readBuffer.getMappedRange().slice(0);
      this._readBuffer.unmap();
      return value;
    });
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
  }) {
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
              buffer.allocatable.dataType as SimpleWgslData<AnySchema>,
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

    console.log('vertexProgram', vertexProgram.code);
    console.log('fragmentProgram', fragmentProgram.code);
    console.log('vertexBindGroupLayout', vertexProgram.bindGroupLayout);
    console.log('fragmentBindGroupLayout', fragmentProgram.bindGroupLayout);

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
    args: Wgsl[];
    code: WgslCode;
    externalLayouts?: GPUBindGroupLayout[];
    externalDeclarations?: Wgsl[];
    label?: string;
  }) {
    const program = new ProgramBuilder(
      this,
      code`
        @compute @workgroup_size(${options.workgroupSize.join(', ')}) fn main_compute(${options.args.flatMap((arg) => [arg, ', '])}) {
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
      this.device,
      computePipeline,
      [program],
      options.externalLayouts?.length ?? 0,
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

class TaskQueue<T> {
  private _queue: (() => Promise<void>)[] = [];
  private _pending = false;

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this._queue.push(async () => {
        try {
          resolve(await task());
        } catch (e) {
          reject(e);
        }
      });
      this._processQueue();
    });
  }

  private async _processQueue() {
    if (this._pending) {
      return;
    }
    this._pending = true;
    while (this._queue.length > 0) {
      const task = this._queue.shift();
      if (task) {
        await task();
      }
    }
    this._pending = false;
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

export async function createRuntime(
  options?:
    | {
        adapter: GPURequestAdapterOptions | undefined;
        device: GPUDeviceDescriptor | undefined;
      }
    | GPUDevice,
) {
  let adapter: GPUAdapter | null = null;
  let device: GPUDevice | null = null;

  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported by this browser.');
  }

  if (!options) {
    adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('Could not find a compatible GPU');
    }
    device = await adapter.requestDevice();
    return new WigsillRuntime(device);
  }

  if (options instanceof GPUDevice) {
    return new WigsillRuntime(options);
  }

  adapter = await navigator.gpu.requestAdapter(options.adapter);
  if (!adapter) {
    throw new Error('Could not find a compatible GPU');
  }
  device = await adapter.requestDevice(options.device);
  return new WigsillRuntime(device);
}

const typeToVertexFormatMap: Record<string, GPUVertexFormat> = {
  f32: 'float32',
  vec2f: 'float32x2',
  vec3f: 'float32x3',
  vec4f: 'float32x4',
  u32: 'uint32',
  vec2u: 'uint32x2',
  vec3u: 'uint32x3',
  vec4u: 'uint32x4',
  i32: 'sint32',
  vec2i: 'sint32x2',
  vec3i: 'sint32x3',
  vec4i: 'sint32x4',
};

function deriveVertexFormat<TData extends SimpleWgslData<AnySchema>>(
  typeSchema: TData,
): GPUVertexFormat {
  if (!('code' in typeSchema)) {
    throw new Error(`Type schema must contain a 'code' field`);
  }
  const code = typeSchema.code as string;
  const vertexFormat = typeToVertexFormatMap[code];
  if (!vertexFormat) {
    throw new Error(`Unknown vertex format for type code: ${code}`);
  }
  return vertexFormat;
}

export default WigsillRuntime;
