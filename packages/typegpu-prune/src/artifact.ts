/**
 * The shape of what a `precompile()` call turns into at build time.
 * Shared by the build-time serializer and the pruned runtime.
 */

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
  /** Index into `codecs`, when the schema of the buffer is known */
  readonly codec?: number | undefined;
  /** Initial contents, base64-encoded. Omitted when all zeros */
  readonly bytes?: string | undefined;
}

export interface LayoutArtifact {
  /** Key of each entry, in binding order (`null` for skipped bindings) */
  readonly keys: (string | null)[];
  readonly entries: GPUBindGroupLayoutEntry[];
}

export interface BindGroupArtifact {
  readonly layout: number;
  readonly entries: (ResourceRef | null)[];
}

export interface VertexLayoutArtifact {
  readonly arrayStride: number;
  readonly stepMode: GPUVertexStepMode;
}

/** A bind group slot of a pipeline: which layout it expects, and a bind group if one is fixed */
export interface GroupArtifact {
  readonly layout: number;
  readonly bindGroup?: number | undefined;
}

export interface ComputePipelineArtifact {
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

export interface RenderPipelineArtifact {
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
