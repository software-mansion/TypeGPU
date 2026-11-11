/**
 * The shape of what a `precompile()` call turns into at build time.
 * Shared by the build-time serializer, the pruned runtime and other hosts.
 */

import type { SerializedDataSchema } from 'typegpu/~internal';

export type Writer = (
  output: DataView,
  offset: number,
  value: unknown,
  littleEndian?: boolean,
  endOffset?: number,
) => void;

export type Reader = (input: DataView, offset: number, littleEndian?: boolean) => unknown;

/** A schema, reduced to what the CPU needs to move its values in and out of buffers */
export interface Codec {
  readonly size: number;
  readonly align: number;
  readonly write?: Writer | undefined;
  readonly read?: Reader | undefined;
}

/** Scalars an array codec can hold */
export type ScalarKind = 'f32' | 'f16' | 'u32' | 'i32';

/**
 * A codec of an array of scalars, emitted as data. Arrays that differ only in their length
 * would otherwise each get a generated writer and reader of their own
 */
export interface ArrayCodecArtifact {
  readonly size: number;
  readonly align: number;
  readonly array: { readonly element: ScalarKind; readonly count: number; readonly stride: number };
}

export type ResourceRef =
  | { readonly buffer: number; readonly offset?: number; readonly size?: number }
  | { readonly sampler: number };

export interface BufferArtifact {
  readonly size: number;
  readonly usage: number;
  readonly name?: string | undefined;
  /** Index into `schemas` (`codecs` in the runtime), when the schema of the buffer is known */
  readonly codec?: number | undefined;
  /** Initial contents, base64-encoded. Omitted when all zeros */
  readonly bytes?: string | undefined;
}

export interface LayoutArtifact {
  /** Key of each entry, in binding order (`null` for skipped bindings) */
  readonly keys: (string | null)[];
  readonly entries: GPUBindGroupLayoutEntry[];
  readonly name?: string | undefined;
  /** Schema of each buffer entry, in binding order (`null` for other entries) */
  readonly schemas?: (number | null)[] | undefined;
  /** The group index set with `$idx` */
  readonly index?: number | undefined;
}

export interface BindGroupArtifact {
  readonly layout: number;
  readonly entries: (ResourceRef | null)[];
}

export interface VertexLayoutArtifact {
  readonly arrayStride: number;
  readonly stepMode: GPUVertexStepMode;
  readonly name?: string | undefined;
  readonly schema?: number | undefined;
}

/** A bind group slot of a pipeline: which layout it expects, and a bind group if one is fixed */
export interface GroupArtifact {
  readonly layout: number;
  readonly bindGroup?: number | undefined;
}

export interface PipelineInputs {
  readonly immediate?: { readonly name: string; readonly schema: number } | undefined;
  /** Present when capturing keeps logs */
  readonly logs?: LogsArtifact | undefined;
}

export interface ComputePipelineArtifact extends PipelineInputs {
  readonly shader: number;
  readonly entryPoint?: string | undefined;
  readonly groups: (GroupArtifact | null)[];
}

export interface GuardedPipelineArtifact {
  readonly pipeline: number;
  /** Buffer holding the `vec3u` size uniform */
  readonly sizeBuffer: number;
  readonly workgroupSize: [number, number, number];
}

export interface RenderPipelineArtifact extends PipelineInputs {
  readonly shader: number;
  readonly groups: (GroupArtifact | null)[];
  /** Vertex layout of each vertex buffer slot */
  readonly vertexSlots: number[];
  /** Vertex buffers bound at build time, as [vertex layout, buffer] */
  readonly vertexBuffers: [number, number][];
  /** The pipeline descriptor without `layout` and shader modules */
  readonly descriptor: {
    readonly vertex: Omit<GPUVertexState, 'module'>;
    readonly fragment?: Omit<GPUFragmentState, 'module'>;
    readonly primitive?: GPUPrimitiveState;
    readonly depthStencil?: GPUDepthStencilState;
    readonly multisample?: GPUMultisampleState;
  };
  /**
   * Fragment targets that were left without a format. Their format is the preferred
   * canvas format, known only at runtime.
   */
  readonly preferredFormatTargets?: number[] | undefined;
  /** The fragment output each color target draws, `null` for a single unnamed output */
  readonly targetKeys?: (string | null)[] | undefined;
}

/**
 * A counter and an array of entries in the pipeline's fixed bind group at `group`, each entry a
 * call's id followed by `words` u32s of its arguments
 */
export interface LogsArtifact {
  readonly group: number;
  readonly counterBinding: number;
  readonly entriesBinding: number;
  readonly capacity: number;
  readonly words: number;
  readonly calls: {
    readonly id: number;
    readonly op: string;
    readonly args: (string | { readonly schema: number })[];
  }[];
}

export interface SchemaLayout {
  readonly size: number;
  readonly align: number;
  readonly name?: string | undefined;
  readonly offsets?: number[] | undefined;
  readonly stride?: number | undefined;
}

/**
 * `serializeDataSchema`'s output with every node except textures annotated with its layout.
 * Runtime-sized arrays have a `count` and `size` of 0
 */
export type SchemaArtifact = SerializedDataSchema & SchemaLayout;

/** The value a `precompile()` arrow returned, with GPU objects as references into the tables */
export type SurfaceNode =
  | { readonly kind: 'object'; readonly entries: Record<string, SurfaceNode> }
  | { readonly kind: 'array'; readonly items: SurfaceNode[] }
  | { readonly kind: 'value'; readonly value: unknown }
  | { readonly kind: 'number'; readonly value: 'NaN' | 'Infinity' | '-Infinity' }
  | { readonly kind: 'undefined' }
  | { readonly kind: 'bigint'; readonly value: string }
  | { readonly kind: 'typedArray'; readonly type: string; readonly values: number[] }
  | { readonly kind: 'schema'; readonly id: number }
  | { readonly kind: 'buffer'; readonly id: number }
  | { readonly kind: 'sampler'; readonly id: number }
  | { readonly kind: 'layout'; readonly id: number }
  | { readonly kind: 'bindGroup'; readonly id: number }
  | { readonly kind: 'vertexLayout'; readonly id: number }
  | { readonly kind: 'computePipeline'; readonly id: number }
  | { readonly kind: 'guardedPipeline'; readonly id: number }
  | { readonly kind: 'renderPipeline'; readonly id: number };

export const ARTIFACT_VERSION = 1;

export interface Artifact extends Omit<Tables, 'codecs' | 'shaders'> {
  readonly version: typeof ARTIFACT_VERSION;
  readonly shaders: string[];
  readonly schemas: SchemaArtifact[];
  readonly surface: SurfaceNode;
}

/**
 * Shaders with their distinct top-level declarations (chunks) emitted once, and each shader
 * as the list of its chunks, in order
 */
export interface ShaderChunks {
  readonly chunks: string[];
  readonly shaders: number[][];
}

export interface Tables {
  readonly codecs: (Codec | ArrayCodecArtifact)[];
  /** Every shader in full, or as chunks when that is smaller */
  readonly shaders: string[] | ShaderChunks;
  readonly buffers: BufferArtifact[];
  readonly samplers: GPUSamplerDescriptor[];
  readonly layouts: LayoutArtifact[];
  readonly bindGroups: BindGroupArtifact[];
  readonly vertexLayouts: VertexLayoutArtifact[];
  readonly computePipelines: ComputePipelineArtifact[];
  readonly guardedPipelines: GuardedPipelineArtifact[];
  readonly renderPipelines: RenderPipelineArtifact[];
}

/** Looks up runtime objects for table entries, used by the generated code that rebuilds the returned value */
export interface AttachContext {
  codec(id: number): Codec;
  buffer(id: number): unknown;
  sampler(id: number): unknown;
  layout(id: number): unknown;
  bindGroup(id: number): unknown;
  vertexLayout(id: number): unknown;
  compute(id: number): unknown;
  guarded(id: number): unknown;
  render(id: number): unknown;
}
