import type { MemoryArena } from './memoryArena';
import ProgramBuilder, { type Program } from './programBuilder';
import type StructDataType from './std140/struct';
import type { MemoryLocation, WGSLMemoryTrait, WGSLSegment } from './types';
import wgsl from './wgsl';
import { type WGSLCode, code } from './wgslCode';
/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a runtime can interact via GPU buffers.
 */
class WGSLRuntime {
  private _arenaToBufferMap = new WeakMap<MemoryArena, GPUBuffer>();
  private _entryToArenaMap = new WeakMap<WGSLMemoryTrait, MemoryArena>();

  private programExecutors: PipelineExecutor<
    GPURenderPipeline | GPUComputePipeline
  >[] = [];

  constructor(public readonly device: GPUDevice) {}

  dispose() {
    // TODO: Clean up all buffers
  }

  registerArena(arena: MemoryArena) {
    for (const entry of arena.memoryEntries) {
      this._entryToArenaMap.set(entry, arena);
    }
  }

  bufferFor(arena: MemoryArena) {
    let buffer = this._arenaToBufferMap.get(arena);

    if (!buffer) {
      // creating buffer
      buffer = this.device.createBuffer({
        usage: arena.usage,
        size: arena.size,
      });

      this._arenaToBufferMap.set(arena, buffer);
    }

    return buffer;
  }

  locateMemory(memoryEntry: WGSLMemoryTrait): MemoryLocation | null {
    const arena = this._entryToArenaMap.get(memoryEntry);

    if (!arena) {
      return null;
    }

    const gpuBuffer = this._arenaToBufferMap.get(arena);
    const offset = arena.offsetFor(memoryEntry);

    if (!gpuBuffer || offset === null) {
      throw new Error('Invalid state');
    }

    return { gpuBuffer, offset };
  }

  makeRenderPipeline(options: {
    vertex?: {
      args: WGSLSegment[];
      code: WGSLCode;
      // biome-ignore lint/suspicious/noExplicitAny:
      output: StructDataType<any>;
    };
    fragment?: {
      args: WGSLSegment[];
      code: WGSLCode;
      output: WGSLSegment;
      target: Iterable<GPUColorTargetState | null>;
    };
    primitive: {
      topology: GPUPrimitiveTopology;
    };
    arenas?: MemoryArena[];
  }) {
    const program = new ProgramBuilder(
      this,
      wgsl`
      ${
        options.vertex
          ? code`@vertex fn main_vertex(${options.vertex.args}) -> ${options.vertex.output} {
            ${options.vertex.code}
          }`
          : ''
      }
      ${
        options.fragment
          ? code`@fragment fn main_frag(${options.fragment.args}) -> ${options.fragment.output} {
            ${options.fragment.code}
          }`
          : ''
      }
      `,
    ).build({
      bindingGroup: 0,
      shaderStage: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      arenas: options.arenas ?? [],
    });

    const shaderModule = this.device.createShaderModule({
      code: program.code,
    });

    console.log(program.code);

    const layout = this.device.createPipelineLayout({
      bindGroupLayouts: [program.bindGroupLayout],
    });

    const renderPipeline = this.device.createRenderPipeline({
      layout: layout,
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
    );
    this.programExecutors.push(executor);
    return executor;
  }

  makeComputePipeline(options: {
    workgroupSize: [number, number?, number?];
    code: WGSLCode;
    arenas?: MemoryArena[];
    firstFreeBindingGroup?: number;
  }) {
    const program = new ProgramBuilder(
      this,
      code`@compute @workgroup_size(${options.workgroupSize.join(', ')}) fn main_compute(${['@builtin(global_invocation_id) global_id: vec3<u32>']}) {
        ${options.code}
      }`,
    ).build({
      bindingGroup: options.firstFreeBindingGroup ?? 0,
      shaderStage: GPUShaderStage.COMPUTE,
      arenas: options.arenas ?? [],
    });

    const shaderModule = this.device.createShaderModule({
      code: program.code,
    });

    console.log(program.code);

    const layout = this.device.createPipelineLayout({
      bindGroupLayouts: [program.bindGroupLayout],
    });

    const computePipeline = this.device.createComputePipeline({
      layout: layout,
      compute: {
        module: shaderModule,
      },
    });

    const executor = new ComputePipelineExecutor(
      this.device,
      computePipeline,
      program,
    );
    this.programExecutors.push(executor);
    return executor;
  }

  flush() {
    this.device.queue.submit(
      this.programExecutors.flatMap((executor) =>
        executor.commandEncoder ? [executor.commandEncoder.finish()] : [],
      ),
    );
  }
}

class PipelineExecutor<T extends GPURenderPipeline | GPUComputePipeline> {
  public commandEncoder?: GPUCommandEncoder;
  constructor(
    public device: GPUDevice,
    public renderPipeline: T,
    public program: Program,
  ) {}
}

class RenderPipelineExecutor extends PipelineExecutor<GPURenderPipeline> {
  execute(vertexCount: number, descriptor: GPURenderPassDescriptor) {
    this.commandEncoder = this.device.createCommandEncoder();
    const passEncoder = this.commandEncoder.beginRenderPass(descriptor);

    passEncoder.setPipeline(this.renderPipeline);
    passEncoder.setBindGroup(0, this.program.bindGroup);
    passEncoder.draw(vertexCount);
    passEncoder.end();
  }
}

class ComputePipelineExecutor extends PipelineExecutor<GPUComputePipeline> {
  execute(workgroupCounts: [number, number?, number?]) {
    this.commandEncoder = this.device.createCommandEncoder();
    const passEncoder = this.commandEncoder.beginComputePass();

    passEncoder.setPipeline(this.renderPipeline);
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
    return new WGSLRuntime(device);
  }

  if (options instanceof GPUDevice) {
    return new WGSLRuntime(options);
  }

  adapter = await navigator.gpu.requestAdapter(options.adapter);
  if (!adapter) {
    throw new Error('Could not find a compatible GPU');
  }
  device = await adapter.requestDevice(options.device);
  return new WGSLRuntime(device);
}

export default WGSLRuntime;
