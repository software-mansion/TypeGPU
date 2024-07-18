import type { MemoryArena } from './memoryArena';
import ProgramBuilder, { type Program } from './programBuilder';
import type StructDataType from './std140/struct';
import type { AnyWgslData } from './std140/types';
import type { MemoryLocation, Wgsl, WgslAllocatable } from './types';
import { type WgslCode, code } from './wgslCode';
import { WgslIdentifier } from './wgslIdentifier';

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a runtime can interact via GPU buffers.
 */
class WigsillRuntime {
  private _arenaToBufferMap = new WeakMap<MemoryArena, GPUBuffer>();
  private _entryToArenaMap = new WeakMap<WgslAllocatable, MemoryArena>();
  private _pipelineExecutors: PipelineExecutor<
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

  locateMemory(memoryEntry: WgslAllocatable): MemoryLocation | null {
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
      args: Wgsl[];
      code: WgslCode;
      output: StructDataType<Record<string, AnyWgslData>>;
    };
    fragment?: {
      args: Wgsl[];
      code: WgslCode;
      output: Wgsl;
      target: Iterable<GPUColorTargetState | null>;
    };
    primitive: GPUPrimitiveState;
    arenas?: MemoryArena[];
    externalLayouts?: GPUBindGroupLayout[];
    additionalShaderCode?: WgslCode;
    label?: string;
  }) {
    const program = new ProgramBuilder(
      this,
      code`
      ${
        options.vertex
          ? code`@vertex fn main_vertex(${options.vertex.args.flatMap((arg) => [arg, ', '])}) -> ${options.vertex.output} {
            ${options.vertex.code}
          }`
          : ''
      }
      ${
        options.fragment
          ? code`@fragment fn main_frag(${options.fragment.args.flatMap((arg) => [arg, ', '])}) -> ${options.fragment.output} {
            ${options.fragment.code}
          }`
          : ''
      }
      ${options.additionalShaderCode ?? ''}
      `,
    ).build({
      bindingGroup: (options.externalLayouts ?? []).length,
      shaderStage:
        (options.vertex ? GPUShaderStage.VERTEX : 0) |
        (options.fragment ? GPUShaderStage.FRAGMENT : 0),
      arenas: options.arenas ?? [],
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
    arenas?: MemoryArena[];
    externalLayouts?: GPUBindGroupLayout[];
    additionalShaderCode?: WgslCode;
    label?: string;
  }) {
    const program = new ProgramBuilder(
      this,
      code`@compute @workgroup_size(${options.workgroupSize.join(', ')}) fn main_compute(${options.args.flatMap((arg) => [arg, ', '])}) {
        ${options.code}
      }
      ${options.additionalShaderCode ?? ''}
      `,
    ).build({
      bindingGroup: (options.externalLayouts ?? []).length,
      shaderStage: GPUShaderStage.COMPUTE,
      arenas: options.arenas ?? [],
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
      this._pipelineExecutors.flatMap((executor) =>
        executor.commandEncoder ? [executor.commandEncoder.finish()] : [],
      ),
    );
  }
}

class PipelineExecutor<T extends GPURenderPipeline | GPUComputePipeline> {
  public commandEncoder?: GPUCommandEncoder;
  constructor(
    public device: GPUDevice,
    public pipeline: T,
    public program: Program,
    public externalLayoutCount: number,
    protected label?: string,
  ) {}
}

class RenderPipelineExecutor extends PipelineExecutor<GPURenderPipeline> {
  execute(
    options: GPURenderPassDescriptor & {
      vertexCount: number;
      externalBindGroups?: GPUBindGroup[];
    },
  ) {
    const { vertexCount, externalBindGroups, ...descriptor } = options;

    if ((externalBindGroups?.length ?? 0) !== this.externalLayoutCount) {
      throw new Error(
        `External bind group count doesn't match the external bind group layout configuration. Expected ${this.externalLayoutCount}, got: ${externalBindGroups?.length ?? 0}`,
      );
    }

    this.commandEncoder = this.device.createCommandEncoder({
      label: this.label ?? '',
    });

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

    passEncoder.draw(vertexCount);
    passEncoder.end();
  }
}

class ComputePipelineExecutor extends PipelineExecutor<GPUComputePipeline> {
  execute(workgroupCounts: [number, number?, number?]) {
    this.commandEncoder = this.device.createCommandEncoder({
      label: this.label ?? '',
    });

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
