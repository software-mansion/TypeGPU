import type { Parsed } from 'typed-binary';
import type { TgpuArray } from './data';
import type { JitTranspiler } from './jitTranspiler';
import type { PlumListener } from './plumStore';
import type { TgpuSettable } from './settableTrait';
import type { TgpuFn } from './tgpuFn';
import type { ExtractPlumValue, TgpuPlum, Unsubscribe } from './tgpuPlumTypes';
import type { TgpuSampler } from './tgpuSampler';
import type {
  TgpuAnyTexture,
  TgpuAnyTextureView,
  TgpuTextureExternal,
} from './tgpuTexture';
import type {
  AnyTgpuData,
  BoundTgpuCode,
  TgpuAllocatable,
  TgpuCode,
  TgpuData,
} from './types';

// ----------
// Public API
// ----------

export type SetPlumAction<T> = T | ((prev: T) => T);

export interface TgpuRuntime {
  readonly device: GPUDevice;
  readonly jitTranspiler?: JitTranspiler | undefined;
  /**
   * The current command encoder. This property will
   * hold the same value until `flush()` is called.
   */
  readonly commandEncoder: GPUCommandEncoder;

  readPlum<TPlum extends TgpuPlum>(plum: TPlum): ExtractPlumValue<TPlum>;

  setPlum<TPlum extends TgpuPlum & TgpuSettable>(
    plum: TPlum,
    value: SetPlumAction<ExtractPlumValue<TPlum>>,
  ): void;

  onPlumChange<TValue>(
    plum: TgpuPlum<TValue>,
    listener: PlumListener<TValue>,
  ): Unsubscribe;

  writeBuffer<TValue extends AnyTgpuData>(
    allocatable: TgpuAllocatable<TValue>,
    data: Parsed<TValue> | TgpuAllocatable<TValue>,
  ): void;

  readBuffer<TData extends AnyTgpuData>(
    allocatable: TgpuAllocatable<TData>,
  ): Promise<Parsed<TData>>;

  setSource(
    texture: TgpuTextureExternal,
    source: HTMLVideoElement | VideoFrame,
  ): void;

  isDirty(texture: TgpuTextureExternal): boolean;
  markClean(texture: TgpuTextureExternal): void;

  bufferFor(allocatable: TgpuAllocatable): GPUBuffer;
  textureFor(view: TgpuAnyTexture | TgpuAnyTextureView): GPUTexture;
  viewFor(view: TgpuAnyTextureView): GPUTextureView;
  externalTextureFor(texture: TgpuTextureExternal): GPUExternalTexture;
  samplerFor(sampler: TgpuSampler): GPUSampler;
  dispose(): void;

  /**
   * Causes all commands enqueued by pipelines to be
   * submitted to the GPU.
   */
  flush(): void;

  makeRenderPipeline(options: RenderPipelineOptions): RenderPipelineExecutor;
  makeComputePipeline(options: ComputePipelineOptions): ComputePipelineExecutor;

  compute(fn: TgpuFn<[]>): void;
}

export interface RenderPipelineOptions {
  vertex: {
    code: TgpuCode | BoundTgpuCode;
    output: {
      [K in symbol]: string;
    } & {
      [K in string]: AnyTgpuData;
    };
  };
  fragment: {
    code: TgpuCode | BoundTgpuCode;
    target: Iterable<GPUColorTargetState | null>;
  };
  primitive: GPUPrimitiveState;
  externalLayouts?: GPUBindGroupLayout[];
  label?: string;
}

export interface ComputePipelineOptions {
  code: TgpuCode | BoundTgpuCode;
  workgroupSize?: readonly [number, number?, number?];
  externalLayouts?: GPUBindGroupLayout[];
  label?: string;
}

export type RenderPipelineExecutorOptions = GPURenderPassDescriptor & {
  vertexCount: number;
  instanceCount?: number;
  firstVertex?: number;
  firstInstance?: number;
  externalBindGroups?: GPUBindGroup[];
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

export function deriveVertexFormat<
  TData extends TgpuData<AnyTgpuData> | TgpuArray<AnyTgpuData>,
>(typeSchema: TData): GPUVertexFormat {
  if ('expressionCode' in typeSchema) {
    const code = typeSchema.expressionCode as string;
    const format = typeToVertexFormatMap[code];
    if (!format) {
      throw new Error(`Unsupported vertex format: ${code}`);
    }
    return format;
  }
  if ('elementType' in typeSchema) {
    return deriveVertexFormat(typeSchema.elementType as TData);
  }
  throw new Error('Invalid vertex format schema');
}
