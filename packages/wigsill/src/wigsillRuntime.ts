import ProgramBuilder, { type Program } from './programBuilder';
import StructDataType from './std140/struct';
import type { AnyWgslData } from './std140/types';
import type { Wgsl, WgslAllocatable } from './types';
import { type WgslCode, code } from './wgslCode';
import { getUsedBuiltinsNamed } from './wgslBuiltin';

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
        size: allocatable.dataType.size,
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
    fragment?: {
      code: WgslCode;
      target: Iterable<GPUColorTargetState | null>;
    };
    primitive: GPUPrimitiveState;
    externalLayouts?: GPUBindGroupLayout[];
    externalDeclarations?: Wgsl[];
    label?: string;
  }) {
    const symbolOutputs = Object.getOwnPropertySymbols(
      options.vertex.output,
    ).map((symbol) => {
      const name = options.vertex.output[symbol];
      if (typeof name !== 'string') {
        throw new Error('Output names must be strings.');
      }
      return { symbol, name };
    });
    const symbolRecord: Record<symbol, string> = Object.fromEntries(
      symbolOutputs.map(({ symbol, name }) => [symbol, name]),
    );

    const vertexOutputBuiltins = getUsedBuiltinsNamed(symbolRecord);
    for (const entry of vertexOutputBuiltins) {
      if (entry.builtin.stage !== 'vertex') {
        throw new Error(
          `Built-in ${entry.name} is used illegally in the vertex shader stage.`,
        );
      }
      if (entry.builtin.direction !== 'output') {
        throw new Error(
          `Built-in ${entry.name} is used illegally as an output in the vertex shader stage.`,
        );
      }
    }
    const outputVars = Object.keys(options.vertex.output);
    const vertexOutput = outputVars.map((name, index) => {
      const varInfo = options.vertex.output[name];
      if (!varInfo) {
        throw new Error('Output names must be strings.');
      }
      return { name, varInfo, index };
    });

    const structFields = [
      ...vertexOutputBuiltins.map(
        (entry) =>
          code`
          @builtin(${entry.builtin.name}) ${entry.name}: ${entry.builtin.type};
        `,
      ),
      ...vertexOutput.map(
        ({ name, varInfo, index }) =>
          code`
          @location(${index}) ${name}: ${varInfo[0]};
        `,
      ),
    ];

    // we also need to construct a struct - the constructor of StructDataType accepts an object with name: vartype pairs
    const vertexOutputStruct = new StructDataType(
      Object.fromEntries(
        vertexOutput.map(({ name, varInfo }) => [name, varInfo[0]]),
      ),
    );

    const program = new ProgramBuilder(
      this,
      code`
      ${
        options.vertex
          ? code`
              @vertex fn main_vertex() -> {
                ${options.vertex.code}
              }
            `
          : ''
      }
      ${
        options.fragment
          ? code`
              @fragment fn main_frag() ->  {
                ${options.fragment.code}
            }`
          : ''
      }
      ${options.externalDeclarations?.flatMap((arg) => [arg, '\n']) ?? ''}
      `,
    ).build({
      bindingGroup: (options.externalLayouts ?? []).length,
      shaderStage:
        (options.vertex ? GPUShaderStage.VERTEX : 0) |
        (options.fragment ? GPUShaderStage.FRAGMENT : 0),
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

    const renderPipeline = this.device.createRenderPipeline({
      label: options.label ?? '',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
      },
      fragment: {
        module: shaderModule,
        targets: options.fragment?.target ?? [],
      },
      primitive: options.primitive,
    });

    const executor = new RenderPipelineExecutor(
      this.device,
      renderPipeline,
      program,
      options.externalLayouts?.length ?? 0,
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
      program,
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
    public program: Program,
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
  execute(
    options: GPURenderPassDescriptor & {
      vertexCount: number;
      instanceCount?: number;
      firstVertex?: number;
      firstInstance?: number;
      externalBindGroups?: GPUBindGroup[];
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
      this.program.bindGroup,
    );

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
    passEncoder.setBindGroup(0, this.program.bindGroup);
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

export default WigsillRuntime;
