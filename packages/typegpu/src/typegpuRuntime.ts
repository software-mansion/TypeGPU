import type { AnySchema } from 'typed-binary';
import type { Parsed } from 'typed-binary';
import type { SimpleWgslData } from './data';
import type { PlumListener } from './plumStore';
import type { WgslSettable } from './settableTrait';
import type { AnyWgslData, WgslAllocatable } from './types';
import type { BoundWgslCode, WgslCode } from './wgslCode';
import type { ExtractPlumValue, Unsubscribe, WgslPlum } from './wgslPlum';
import type { WgslSampler } from './wgslSampler';
import type {
  WgslAnyTexture,
  WgslAnyTextureView,
  WgslTextureExternal,
} from './wgslTexture';

// ----------
// Public API
// ----------

export type SetPlumAction<T> = T | ((prev: T) => T);

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
    value: SetPlumAction<ExtractPlumValue<TPlum>>,
  ): void;

  onPlumChange<TValue>(
    plum: WgslPlum<TValue>,
    listener: PlumListener<TValue>,
  ): Unsubscribe;

  writeBuffer<TValue extends AnyWgslData>(
    allocatable: WgslAllocatable<TValue>,
    data: Parsed<TValue>,
  ): void;

  readBuffer<TData extends AnyWgslData>(
    allocatable: WgslAllocatable<TData>,
  ): Promise<Parsed<TData>>;

  setSource(
    texture: WgslTextureExternal,
    source: HTMLVideoElement | VideoFrame,
  ): void;

  isDirty(texture: WgslTextureExternal): boolean;
  markClean(texture: WgslTextureExternal): void;

  bufferFor(allocatable: WgslAllocatable): GPUBuffer;
  textureFor(view: WgslAnyTexture | WgslAnyTextureView): GPUTexture;
  viewFor(view: WgslAnyTextureView): GPUTextureView;
  externalTextureFor(texture: WgslTextureExternal): GPUExternalTexture;
  samplerFor(sampler: WgslSampler): GPUSampler;
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
    code: WgslCode | BoundWgslCode;
    output: {
      [K in symbol]: string;
    } & {
      [K in string]: AnyWgslData;
    };
  };
  fragment: {
    code: WgslCode | BoundWgslCode;
    target: Iterable<GPUColorTargetState | null>;
  };
  primitive: GPUPrimitiveState;
  externalLayouts?: GPUBindGroupLayout[];
  label?: string;
}

export interface ComputePipelineOptions {
  code: WgslCode | BoundWgslCode;
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

export function deriveVertexFormat<TData extends SimpleWgslData<AnySchema>>(
  typeSchema: TData,
): GPUVertexFormat {
  if (!('expressionCode' in typeSchema)) {
    throw new Error(`Type schema must contain a 'code' field`);
  }
  const code = typeSchema.getUnderlyingTypeString();

  const vertexFormat = typeToVertexFormatMap[code];
  if (!vertexFormat) {
    throw new Error(`Unknown vertex format for type code: ${code}`);
  }
  return vertexFormat;
}
