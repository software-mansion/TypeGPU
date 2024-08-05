import type { Parsed } from 'typed-binary';
import type { WgslStruct } from './data';
import type { WgslSettable } from './settableTrait';
import type { AnyWgslData } from './types';
import type { Wgsl, WgslAllocatable } from './types';
import type { ExtractPlumValue, Unsubscribe, WgslPlum } from './wgslPlum';

// ----------
// Public API
// ----------

export interface TypeGpuRuntime {
  readonly device: GPUDevice;
  /**
   * The current command encoder. This property will
   * hold the same value until `flush()` is called.
   */
  readonly commandEncoder: GPUCommandEncoder;

  readPlum<TPlum extends WgslPlum>(plum: TPlum): ExtractPlumValue<TPlum>;

  setPlum<TPlum extends WgslPlum & WgslSettable>(
    plum: TPlum,
    value: ExtractPlumValue<TPlum>,
  ): void;

  onPlumChange<TValue>(
    plum: WgslPlum<TValue>,
    listener: () => unknown,
  ): Unsubscribe;

  writeBuffer<TValue extends AnyWgslData>(
    allocatable: WgslAllocatable<TValue>,
    data: Parsed<TValue>,
  ): void;

  readBuffer<TData extends AnyWgslData>(
    allocatable: WgslAllocatable<TData>,
  ): Promise<Parsed<TData>>;

  copyBuffer<TData extends AnyWgslData>(
    source: WgslAllocatable<TData>,
    destination: WgslAllocatable<TData>,
    mask?: Parsed<TData>,
  ): void;

  bufferFor(allocatable: WgslAllocatable): GPUBuffer;
  dispose(): void;

  /**
   * Causes all commands enqueued by pipelines to be
   * submitted to the GPU.
   */
  flush(): void;

  makeRenderPipeline(options: RenderPipelineOptions): RenderPipelineExecutor;
  makeComputePipeline(options: ComputePipelineOptions): ComputePipelineExecutor;
}

export interface RenderPipelineOptions {
  vertex: {
    args: Wgsl[];
    code: Wgsl;
    output: WgslStruct<Record<string, AnyWgslData>>;
    buffersLayouts?: Iterable<GPUVertexBufferLayout | null>;
  };
  fragment: {
    args: Wgsl[];
    code: Wgsl;
    output: Wgsl;
    target: Iterable<GPUColorTargetState | null>;
  };
  primitive: GPUPrimitiveState;
  externalLayouts?: GPUBindGroupLayout[];
  externalDeclarations?: Wgsl[];
  label?: string;
}

export interface ComputePipelineOptions {
  workgroupSize?: readonly [number, number?, number?];
  args?: Wgsl[];
  code: Wgsl;
  externalLayouts?: GPUBindGroupLayout[];
  externalDeclarations?: Wgsl[];
  label?: string;
}

export type RenderPipelineExecutorOptions = GPURenderPassDescriptor & {
  vertexCount: number;
  instanceCount?: number;
  firstVertex?: number;
  firstInstance?: number;
  externalBindGroups?: GPUBindGroup[];
  externalVertexBuffers?: GPUBuffer[];
};

export interface RenderPipelineExecutor {
  execute(options: RenderPipelineExecutorOptions): void;
}

export type ComputePipelineExecutorOptions = {
  workgroups?: readonly [number, number?, number?];
  externalBindGroups?: GPUBindGroup[];
};

export interface ComputePipelineExecutor {
  execute(options?: ComputePipelineExecutorOptions): void;
}
