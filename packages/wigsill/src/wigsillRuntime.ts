import type { Parsed } from 'typed-binary';
import type { WgslStruct } from './data';
import type { AnyWgslData } from './types';
import type { Wgsl, WgslAllocatable } from './types';
import type { WgslCode } from './wgslCode';

// ----------
// Public API
// ----------

export interface WigsillRuntime {
  readonly device: GPUDevice;

  writeBuffer<TValue extends AnyWgslData>(
    allocatable: WgslAllocatable<TValue>,
    data: Parsed<TValue>,
  ): void;

  readBuffer<TData extends AnyWgslData>(
    allocatable: WgslAllocatable<TData>,
  ): Promise<Parsed<TData>>;

  bufferFor(allocatable: WgslAllocatable): GPUBuffer;
  dispose(): void;
  flush(): void;

  makeRenderPipeline(options: RenderPipelineOptions): RenderPipelineExecutor;
  makeComputePipeline(options: ComputePipelineOptions): ComputePipelineExecutor;
}

export interface RenderPipelineOptions {
  vertex: {
    args: Wgsl[];
    code: WgslCode;
    output: WgslStruct<Record<string, AnyWgslData>>;
    buffersLayouts?: Iterable<GPUVertexBufferLayout | null>;
  };
  fragment: {
    args: Wgsl[];
    code: WgslCode;
    output: Wgsl;
    target: Iterable<GPUColorTargetState | null>;
  };
  primitive: GPUPrimitiveState;
  externalLayouts?: GPUBindGroupLayout[];
  externalDeclarations?: Wgsl[];
  label?: string;
}

export interface ComputePipelineOptions {
  workgroupSize: [number, number?, number?];
  args: Wgsl[];
  code: WgslCode;
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

export interface ComputePipelineExecutor {
  execute(workgroupCounts: [number, number?, number?]): void;
}
