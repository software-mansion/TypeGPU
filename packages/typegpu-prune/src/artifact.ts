/**
 * The shape of what a `precompile()` call turns into at build time.
 * `Artifact` is what capturing produces: plain data any host can read. `Tables` is what the
 * pruned runtime reads: the artifact's tables, with JS codecs generated from its schemas.
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

export type ResourceRef =
  | { readonly buffer: number; readonly offset?: number; readonly size?: number }
  | { readonly sampler: number };

export interface BufferArtifact {
  readonly size: number;
  readonly usage: number;
  /**
   * Index into the artifact's `schemas` (and the runtime's `codecs`, generated from them in the
   * same order), when the schema of the buffer is known
   */
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
  /** The group index the layout was pinned to with `$idx`, which other layouts are numbered around */
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
  /** Schema of each element */
  readonly schema?: number | undefined;
}

/** A bind group slot of a pipeline: which layout it expects, and a bind group if one is fixed */
export interface GroupArtifact {
  readonly layout: number;
  readonly bindGroup?: number | undefined;
}

/** What the shaders of a pipeline read besides its bind groups and vertex buffers */
export interface PipelineInputs {
  /** The immediate variable the shaders read, set per dispatch or draw */
  readonly immediate?: { readonly name: string; readonly schema: number } | undefined;
  /** The shaders' `console.log`s, when capturing keeps them */
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
 * Where a pipeline's `console.log`s write: a counter and an array of entries, each a call's
 * id followed by `words` u32s of its arguments. Both are in the group TypeGPU creates for
 * fixed resources, whose bind group is fixed in the pipeline's `groups`.
 */
export interface LogsArtifact {
  readonly group: number;
  readonly counterBinding: number;
  readonly entriesBinding: number;
  /** How many calls fit between reads */
  readonly capacity: number;
  readonly words: number;
  readonly calls: {
    readonly id: number;
    readonly op: string;
    /** Text, or the schema of a logged value */
    readonly args: (string | { readonly schema: number })[];
  }[];
}

/** What a schema node holds besides TypeGPU's serialization of it */
export interface SchemaLayout {
  readonly size: number;
  readonly align: number;
  /** Structs and unstructs: the name TypeGPU knows them by */
  readonly name?: string | undefined;
  /** Structs and unstructs: where each property starts */
  readonly offsets?: number[] | undefined;
  /** Arrays and disarrays: bytes from one element to the next */
  readonly stride?: number | undefined;
}

/**
 * A schema as data: TypeGPU's own serialization (`serializeDataSchema`, which reads it back
 * ignoring the rest), with every node except textures annotated with its `SchemaLayout`, so
 * hosts don't need to know WGSL's memory layout rules or lose the names of nested structs.
 * Runtime-sized arrays have a `count` of 0.
 */
export type SchemaArtifact = SerializedDataSchema & SchemaLayout;

/** The value a `precompile()` arrow returned, with GPU objects as references into the tables */
export type SurfaceNode =
  | { readonly kind: 'object'; readonly entries: Record<string, SurfaceNode> }
  | { readonly kind: 'array'; readonly items: SurfaceNode[] }
  /** JSON-compatible values, and numbers JSON can't hold as strings */
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

/** A captured `precompile()` arrow, as JSON-serializable data */
export interface Artifact extends Omit<Tables, 'codecs'> {
  readonly version: typeof ARTIFACT_VERSION;
  readonly schemas: SchemaArtifact[];
  readonly surface: SurfaceNode;
}

export interface Tables {
  readonly codecs: Codec[];
  readonly shaders: string[];
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
