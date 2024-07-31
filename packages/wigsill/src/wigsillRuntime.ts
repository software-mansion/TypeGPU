import type { AnySchema } from 'typed-binary';
import type { Parsed } from 'typed-binary';
import type { SimpleWgslData } from './data';
import type { AnyWgslData, WgslAllocatable } from './types';
import type { WgslCode } from './wgslCode';
import type { WgslSampler } from './wgslSampler';
import type {
  WgslAnyTexture,
  WgslAnyTextureView,
  WgslTextureExternal,
} from './wgslTexture';

// ----------
// Public API
// ----------

export interface WigsillRuntime {
  readonly device: GPUDevice;
  /**
   * The current command encoder. This property will
   * hold the same value until `flush()` is called.
   */
  readonly commandEncoder: GPUCommandEncoder;

  writeBuffer<TValue extends AnyWgslData>(
    allocatable: WgslAllocatable<TValue>,
    data: Parsed<TValue>,
  ): void;

  readBuffer<TData extends AnyWgslData>(
    allocatable: WgslAllocatable<TData>,
  ): Promise<Parsed<TData>>;

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
}

export interface ComputePipelineOptions {
  workgroupSize: [number, number?, number?];
  code: WgslCode;
  label?: string;
}

export type RenderPipelineExecutorOptions = GPURenderPassDescriptor & {
  vertexCount: number;
  instanceCount?: number;
  firstVertex?: number;
  firstInstance?: number;
};

export interface RenderPipelineExecutor {
  execute(options: RenderPipelineExecutorOptions): void;
}

export type ComputePipelineExecutorOptions = {
  workgroups: [number, number?, number?];
  externalBindGroups?: GPUBindGroup[];
};

export interface ComputePipelineExecutor {
  execute(options: ComputePipelineExecutorOptions): void;
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
