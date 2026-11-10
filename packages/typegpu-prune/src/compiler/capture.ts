import { d, tgpu, type TgpuComputePipeline, type TgpuRenderPipeline, type TgpuRoot } from 'typegpu';
import {
  getLogResources,
  getName,
  type LogResources,
  serializeDataSchema,
  snapshotResource,
} from 'typegpu/~internal';
import {
  type Artifact,
  ARTIFACT_VERSION,
  type BindGroupArtifact,
  type BufferArtifact,
  type ComputePipelineArtifact,
  type GroupArtifact,
  type GuardedPipelineArtifact,
  type LayoutArtifact,
  type LogsArtifact,
  type PipelineInputs,
  type RenderPipelineArtifact,
  type ResourceRef,
  type SchemaArtifact,
  type SurfaceNode,
  type VertexLayoutArtifact,
} from '../artifact.ts';
import {
  createRecordingDevice,
  installRecordingNavigator,
  installWebGPUGlobals,
  PREFERRED_FORMAT,
  type RecordedBuffer,
  recordOf,
} from './recordingDevice.ts';

export interface CaptureOptions {
  /**
   * Features of the recording device, each enabled in every shader
   * @default []
   */
  features?: GPUFeatureName[] | undefined;
  /**
   * WGSL language features of the recording device, such as `immediate_address_space`
   * @default []
   */
  wgslLanguageFeatures?: string[] | undefined;
  /** @default true */
  stripLogs?: boolean | undefined;
  /** @default true */
  minify?: boolean | undefined;
  /** As `tgpu.init`'s `unstable_names` */
  names?: 'random' | 'strict' | undefined;
}

export interface CaptureContext {
  /**
   * Resolves a pipeline while the arrow runs, as on a device that has `features` too.
   * Pipelines left alone resolve once the arrow is done, with the features of the capture.
   */
  resolve(pipeline: Pipeline, features?: GPUFeatureName[]): void;
}

export interface CaptureResult {
  artifact: Artifact;
  async: boolean;
  warnings: string[];
}

export class PrecompileError extends Error {
  constructor(message: string) {
    super(`[@typegpu/prune] ${message}`);
    this.name = 'PrecompileError';
  }
}

type Layout = { entries: Record<string, unknown>; index?: number | undefined };
type VertexLayout = {
  stride: number;
  stepMode: GPUVertexStepMode;
  schemaForCount(n: number): { elementType: d.BaseData };
};
type Pipeline = TgpuComputePipeline | TgpuRenderPipeline;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function toBase64(bytes: Uint8Array): string | undefined {
  if (bytes.every((byte) => byte === 0)) {
    return undefined;
  }
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function data<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_, item) => {
      if (recordOf(item)) {
        throw new PrecompileError('Internal: a GPU object leaked into serialized data.');
      }
      return item;
    }),
  ) as T;
}

function entrySchema(entry: unknown): d.BaseData | undefined {
  const { uniform, storage } = (entry ?? {}) as { uniform?: unknown; storage?: unknown };
  const schema = uniform ?? storage;
  if (schema === undefined) {
    return undefined;
  }
  return d.isData(schema) ? schema : (schema as (length: number) => d.BaseData)(0);
}

class Capturer {
  readonly root: TgpuRoot;
  readonly warnings: string[] = [];

  readonly schemas: SchemaArtifact[] = [];
  readonly shaders: string[] = [];
  readonly buffers: BufferArtifact[] = [];
  readonly samplers: GPUSamplerDescriptor[] = [];
  readonly layouts: LayoutArtifact[] = [];
  readonly bindGroups: BindGroupArtifact[] = [];
  readonly vertexLayouts: VertexLayoutArtifact[] = [];
  readonly computePipelines: ComputePipelineArtifact[] = [];
  readonly guardedPipelines: GuardedPipelineArtifact[] = [];
  readonly renderPipelines: RenderPipelineArtifact[] = [];

  readonly #ids = new Map<unknown, number>();

  constructor(root: TgpuRoot) {
    this.root = root;
  }

  #memo<T>(key: unknown, table: T[], create: () => T): number {
    const existing = this.#ids.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const id = table.length;
    this.#ids.set(key, id);
    // Reserving the slot first, so that recursive references see the id
    table.push(undefined as T);
    table[id] = create();
    return id;
  }

  schema(schema: d.BaseData): number {
    return this.#memo(schema, this.schemas, () => describeSchema(schema));
  }

  /** Identical WGSL (e.g. of pipelines that differ only in their target format) is stored once */
  shader(code: string): number {
    return this.#memo(`shader:${code}`, this.shaders, () => code);
  }

  /** A buffer by its recorded GPU buffer, with the schema when it is known */
  rawBuffer(raw: RecordedBuffer, schema?: d.BaseData): number {
    const label = recordOf<GPUBufferDescriptor>(raw)?.desc.label;
    const id = this.#memo(raw, this.buffers, () => ({
      size: raw.size,
      usage: raw.usage,
      bytes: toBase64(raw.shadow),
      ...(label && { name: label }),
    }));
    const art = this.buffers[id] as BufferArtifact;
    if (schema && art.codec === undefined) {
      this.buffers[id] = { ...art, codec: this.schema(schema) };
    }
    return id;
  }

  buffer(buffer: { dataType: d.BaseData }): number {
    return this.rawBuffer(this.#unwrapBuffer(buffer), buffer.dataType);
  }

  #unwrapBuffer(buffer: unknown): RecordedBuffer {
    return this.root.unwrap(buffer as never) as unknown as RecordedBuffer;
  }

  rawSampler(raw: unknown): number {
    return this.#memo(raw, this.samplers, () => recordOf<GPUSamplerDescriptor>(raw)?.desc ?? {});
  }

  rawLayout(raw: unknown): number {
    return this.#memo(raw, this.layouts, () => {
      const desc = recordOf<GPUBindGroupLayoutDescriptor>(raw)?.desc;
      if (!desc) {
        throw new PrecompileError('Internal: expected a recorded bind group layout.');
      }
      const entries = [...desc.entries];
      return {
        keys: entries.map(() => null),
        entries: entries.map(({ binding, visibility, ...rest }) => ({
          binding,
          visibility,
          ...rest,
        })),
      };
    });
  }

  layout(layout: Layout): number {
    const id = this.rawLayout(this.root.unwrap(layout as never));
    // A layout first seen through a bind group has no keys yet
    const art = this.layouts[id] as LayoutArtifact;
    if (art.name === undefined && art.keys.every((key) => key === null)) {
      const entries = Object.entries(layout.entries);
      const schemas = entries.map(([, entry]) => {
        const schema = entrySchema(entry);
        return schema ? this.schema(schema) : null;
      });
      this.layouts[id] = {
        ...art,
        keys: entries.map(([key, entry]) => (entry === null ? null : key)),
        name: getName(layout),
        ...(schemas.some((schema) => schema !== null) && { schemas }),
        ...(layout.index !== undefined && { index: layout.index }),
      };
    }
    return id;
  }

  rawBindGroup(raw: unknown): number {
    return this.#memo(raw, this.bindGroups, () => {
      const desc = recordOf<GPUBindGroupDescriptor>(raw)?.desc;
      if (!desc) {
        throw new PrecompileError('Internal: expected a recorded bind group.');
      }
      const entries: (ResourceRef | null)[] = [];
      for (const entry of desc.entries) {
        entries[entry.binding] = this.#resource(entry.resource);
      }
      return {
        layout: this.rawLayout(desc.layout),
        entries: Array.from(entries, (entry) => entry ?? null),
      };
    });
  }

  #resource(resource: unknown): ResourceRef {
    const kind = recordOf(resource)?.kind;
    if (kind === 'buffer') {
      return { buffer: this.rawBuffer(resource as RecordedBuffer) };
    }
    if (kind === 'sampler') {
      return { sampler: this.rawSampler(resource) };
    }
    if (typeof resource === 'object' && resource !== null && 'buffer' in resource) {
      const { buffer, offset, size } = resource as GPUBufferBinding;
      return {
        buffer: this.rawBuffer(buffer as unknown as RecordedBuffer),
        ...(offset !== undefined && { offset }),
        ...(size !== undefined && { size }),
      };
    }
    throw new PrecompileError(
      'Only buffers and samplers can be bound at build time. Bind textures from the code that uses the result.',
    );
  }

  bindGroup(bindGroup: unknown): number {
    const raw = recordOf(bindGroup) ? bindGroup : this.root.unwrap(bindGroup as never);
    return this.rawBindGroup(raw);
  }

  vertexLayout(layout: VertexLayout): number {
    return this.#memo(layout, this.vertexLayouts, () => ({
      arrayStride: layout.stride,
      stepMode: layout.stepMode,
      name: getName(layout),
      schema: this.schema(layout.schemaForCount(0).elementType),
    }));
  }

  #groups(
    usedLayouts: (Layout | undefined)[] | undefined,
    bound: [unknown, unknown][] | undefined,
  ): (GroupArtifact | null)[] {
    return Array.from(usedLayouts ?? [], (layout) => {
      if (!layout) {
        return null;
      }
      const prior = bound?.find(([key]) => key === layout)?.[1];
      return {
        layout: this.layout(layout),
        ...(prior !== undefined && { bindGroup: this.bindGroup(prior) }),
      };
    });
  }

  #inputs(
    pipeline: Pipeline,
    immediate: { dataType: d.BaseData } | undefined,
    groups: (GroupArtifact | null)[],
  ): PipelineInputs {
    const logs = getLogResources(pipeline);
    return {
      ...(immediate && {
        immediate: {
          name: getName(immediate) ?? 'immediate',
          schema: this.schema(immediate.dataType),
        },
      }),
      ...(logs && { logs: this.#logs(logs, groups) }),
    };
  }

  #logs(logs: LogResources, groups: (GroupArtifact | null)[]): LogsArtifact {
    const counter = this.rawBuffer(this.#unwrapBuffer(snapshotBuffer(logs.indexBuffer)));
    const entries = this.rawBuffer(this.#unwrapBuffer(snapshotBuffer(logs.dataBuffer)));
    for (const [group, slot] of groups.entries()) {
      const bound = this.bindGroups[slot?.bindGroup ?? -1]?.entries ?? [];
      const bindingOf = (buffer: number) =>
        bound.findIndex((ref) => ref !== null && 'buffer' in ref && ref.buffer === buffer);
      const counterBinding = bindingOf(counter);
      const entriesBinding = bindingOf(entries);
      if (counterBinding >= 0 && entriesBinding >= 0) {
        return {
          group,
          counterBinding,
          entriesBinding,
          capacity: logs.options.logCountLimit,
          words: Math.ceil(logs.options.logSizeLimit / 4),
          calls: Array.from(logs.logIdToMeta, ([id, { op, argTypes }]) => ({
            id,
            op: op.name,
            args: argTypes.map((type) =>
              typeof type === 'string' ? type : { schema: this.schema(type) },
            ),
          })),
        };
      }
    }
    throw new PrecompileError(
      "Internal: a pipeline's log buffers aren't in its fixed bind groups.",
    );
  }

  computePipeline(pipeline: object): number {
    return this.#memo(pipeline, this.computePipelines, () => {
      const soul = snapshotResource(pipeline) as unknown as {
        raw: unknown;
        usedBindGroupLayouts?: Layout[];
        bindGroups?: [unknown, unknown][];
        usedImmediate?: { dataType: d.BaseData };
      };
      const desc = recordOf<GPUComputePipelineDescriptor>(soul.raw)?.desc;
      if (!desc) {
        throw new PrecompileError('Internal: expected a recorded compute pipeline.');
      }
      const code = recordOf<GPUShaderModuleDescriptor>(desc.compute.module)?.desc.code ?? '';
      const groups = this.#groups(soul.usedBindGroupLayouts, soul.bindGroups);
      return {
        shader: this.shader(code),
        ...(desc.compute.entryPoint !== undefined && { entryPoint: desc.compute.entryPoint }),
        groups,
        ...this.#inputs(pipeline as Pipeline, soul.usedImmediate, groups),
      };
    });
  }

  guardedPipeline(pipeline: object): number {
    return this.#memo(pipeline, this.guardedPipelines, () => {
      const soul = snapshotResource(pipeline) as unknown as {
        pipeline: object;
        size: { uniform: object };
        workgroupSize: ArrayLike<number>;
      };
      const sizeSoul = snapshotResource(soul.size.uniform) as unknown as {
        buffer: { dataType: d.BaseData };
      };
      return {
        pipeline: this.computePipeline(soul.pipeline),
        sizeBuffer: this.buffer(sizeSoul.buffer),
        workgroupSize: Array.from(soul.workgroupSize) as [number, number, number],
      };
    });
  }

  renderPipeline(pipeline: object, path: string): number {
    return this.#memo(pipeline, this.renderPipelines, () => {
      const soul = snapshotResource(pipeline) as unknown as {
        raw: unknown;
        usedBindGroupLayouts?: Layout[];
        bindGroups?: [unknown, unknown][];
        usedVertexLayouts?: VertexLayout[];
        vertexBuffers?: [VertexLayout, { dataType?: d.BaseData }][];
        connectedTargets?: ({ key: string | undefined } | null)[];
        indexBuffer?: unknown;
        usedImmediate?: { dataType: d.BaseData };
      };
      if (soul.indexBuffer) {
        throw new PrecompileError(
          `${path}: index buffers bound at build time are not supported yet. Bind them with .withIndexBuffer() at runtime.`,
        );
      }
      const desc = recordOf<GPURenderPipelineDescriptor>(soul.raw)?.desc;
      if (!desc) {
        throw new PrecompileError('Internal: expected a recorded render pipeline.');
      }
      const code = recordOf<GPUShaderModuleDescriptor>(desc.vertex.module)?.desc.code ?? '';
      const { module: _vertexModule, ...vertex } = desc.vertex;
      // Targets without a format got the placeholder for the preferred canvas format
      const preferredFormatTargets: number[] = [];
      const fragment = desc.fragment
        ? (({ module: _fragmentModule, targets, ...rest }) => ({
            ...rest,
            targets: [...targets].map((target, idx) => {
              if (!target || (target.format as string) !== PREFERRED_FORMAT) {
                return target;
              }
              preferredFormatTargets.push(idx);
              const { format: _format, ...withoutFormat } = target;
              return withoutFormat;
            }),
          }))(desc.fragment)
        : undefined;
      const targetKeys = (soul.connectedTargets ?? []).map((target) => target?.key ?? null);
      const groups = this.#groups(soul.usedBindGroupLayouts, soul.bindGroups);

      return {
        shader: this.shader(code),
        groups,
        vertexSlots: (soul.usedVertexLayouts ?? []).map((layout) => this.vertexLayout(layout)),
        vertexBuffers: (soul.vertexBuffers ?? []).map(([layout, buffer]) => {
          const raw = recordOf(buffer)
            ? (buffer as unknown as RecordedBuffer)
            : this.#unwrapBuffer(buffer);
          return [this.vertexLayout(layout), this.rawBuffer(raw, buffer.dataType)] as [
            number,
            number,
          ];
        }),
        descriptor: data({
          vertex,
          fragment,
          primitive: desc.primitive,
          depthStencil: desc.depthStencil,
          multisample: desc.multisample,
        }) as RenderPipelineArtifact['descriptor'],
        ...(preferredFormatTargets.length > 0 && { preferredFormatTargets }),
        ...(targetKeys.some((key) => key !== null) && { targetKeys }),
        ...this.#inputs(pipeline as Pipeline, soul.usedImmediate, groups),
      };
    });
  }

  surface(value: unknown, path: string): SurfaceNode {
    if (value === undefined) {
      return { kind: 'undefined' };
    }
    if (typeof value === 'bigint') {
      return { kind: 'bigint', value: String(value) };
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return { kind: 'number', value: String(value) as 'NaN' | 'Infinity' | '-Infinity' };
    }
    if (typeof value === 'symbol') {
      throw new PrecompileError(`${path}: symbols can't be returned from precompile().`);
    }
    if (d.isData(value)) {
      return { kind: 'schema', id: this.schema(value as d.BaseData) };
    }
    if (typeof value === 'function') {
      throw new PrecompileError(
        `${path}: functions can't be returned from precompile(). Return pipelines built from them instead.`,
      );
    }
    if (value === null || typeof value !== 'object') {
      return { kind: 'value', value };
    }
    if (Array.isArray(value)) {
      return {
        kind: 'array',
        items: value.map((item, idx) => this.surface(item, `${path}[${idx}]`)),
      };
    }
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      return {
        kind: 'typedArray',
        type: value.constructor.name,
        values: Array.from(value as unknown as ArrayLike<number>),
      };
    }

    if (recordOf(value)?.kind === 'bindGroup') {
      return { kind: 'bindGroup', id: this.rawBindGroup(value) };
    }

    const resourceType = (value as { resourceType?: string }).resourceType;
    switch (resourceType) {
      case 'buffer':
        return { kind: 'buffer', id: this.buffer(value as { dataType: d.BaseData }) };
      case 'uniform':
      case 'mutable':
      case 'readonly':
        return { kind: 'buffer', id: this.buffer(snapshotBuffer(value)) };
      case 'sampler':
        return { kind: 'sampler', id: this.rawSampler(this.root.unwrap(value as never)) };
      case 'bind-group-layout':
        return { kind: 'layout', id: this.layout(value as Layout) };
      case 'bind-group':
        return { kind: 'bindGroup', id: this.bindGroup(value) };
      case 'vertex-layout':
        return { kind: 'vertexLayout', id: this.vertexLayout(value as VertexLayout) };
      case 'compute-pipeline':
        return { kind: 'computePipeline', id: this.computePipeline(value) };
      case 'guarded-compute-pipeline':
        return { kind: 'guardedPipeline', id: this.guardedPipeline(value) };
      case 'render-pipeline':
        return { kind: 'renderPipeline', id: this.renderPipeline(value, path) };
      case undefined:
        break;
      default:
        throw new PrecompileError(`${path}: '${resourceType}' can't be precompiled yet.`);
    }

    if (isPlainObject(value)) {
      return {
        kind: 'object',
        entries: Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, this.surface(item, `${path}.${key}`)]),
        ),
      };
    }

    throw new PrecompileError(
      `${path}: ${Object.prototype.toString.call(value)} can't be returned from precompile().`,
    );
  }

  artifact(surface: SurfaceNode): Artifact {
    return data({
      version: ARTIFACT_VERSION,
      surface,
      schemas: this.schemas,
      shaders: this.shaders,
      buffers: this.buffers,
      samplers: this.samplers,
      layouts: this.layouts,
      bindGroups: this.bindGroups,
      vertexLayouts: this.vertexLayouts,
      computePipelines: this.computePipelines,
      guardedPipelines: this.guardedPipelines,
      renderPipelines: this.renderPipelines,
    });
  }
}

function snapshotBuffer(usage: unknown): { dataType: d.BaseData } {
  return (snapshotResource(usage) as unknown as { buffer: { dataType: d.BaseData } }).buffer;
}

function describeSchema(schema: d.BaseData): SchemaArtifact {
  return annotate(schema, serializeDataSchema(schema)) as SchemaArtifact;
}

function annotate(schema: d.BaseData, serialized: object): object {
  const node = serialized as Record<string, unknown>;
  const size = d.sizeOf(schema as d.AnyData);
  const layout = {
    size: Number.isFinite(size) ? size : 0,
    align: d.alignmentOf(schema as d.AnyData),
  };
  switch (node.type) {
    case 'struct':
    case 'unstruct': {
      const propTypes = (schema as unknown as { propTypes: Record<string, d.BaseData> }).propTypes;
      const props = (node.props as [string, object][]).map(
        ([key, prop]) => [key, annotate(propTypes[key] as d.BaseData, prop)] as const,
      );
      const offsets = Object.keys(propTypes).map(
        (key) =>
          d.memoryLayoutOf(schema as d.AnyData, (s) => (s as Record<string, unknown>)[key]).offset,
      );
      return { ...node, props, ...layout, name: getName(schema), offsets };
    }
    case 'array':
    case 'disarray': {
      const element = (schema as unknown as { elementType: d.BaseData }).elementType;
      const one =
        node.type === 'array'
          ? d.arrayOf(element as d.AnyWgslData, 1)
          : d.disarrayOf(element as d.AnyData, 1);
      return {
        ...node,
        element: annotate(element, node.element as object),
        ...layout,
        stride: d.sizeOf(one as d.AnyData),
      };
    }
    case 'atomic':
    case 'decorated':
      return {
        ...node,
        inner: annotate((schema as unknown as { inner: d.BaseData }).inner, node.inner as object),
        ...layout,
      };
    case 'd':
      return { ...node, ...layout };
    default:
      return node;
  }
}

export async function capture(
  fn: (root: TgpuRoot, context: CaptureContext) => unknown,
  options: CaptureOptions = {},
): Promise<CaptureResult> {
  installWebGPUGlobals();

  const recordingNavigator = installRecordingNavigator(options.wgslLanguageFeatures);
  try {
    const features = new Set<string>(options.features);
    const root = tgpu.initFromDevice({
      device: createRecordingDevice(features),
      unstable_minify: options.minify ?? true,
      ...(options.names && { unstable_names: options.names }),
      unstable_logOptions: { stripLogs: options.stripLogs ?? true },
    });
    const context: CaptureContext = {
      resolve(pipeline, extra = []) {
        const added = extra.filter((feature) => !features.has(feature));
        for (const feature of added) {
          features.add(feature);
        }
        recordingNavigator.allowPreferredFormat();
        try {
          root.unwrap(pipeline as never);
        } finally {
          recordingNavigator.allowPreferredFormat(false);
          for (const feature of added) {
            features.delete(feature);
          }
        }
      },
    };

    const pending = fn(root, context);
    const isAsync = pending instanceof Promise;
    const result = await pending;

    // Pipelines are created lazily, so TypeGPU picks the default format of their targets only now
    recordingNavigator.allowPreferredFormat();
    const capturer = new Capturer(root);
    const artifact = capturer.artifact(capturer.surface(result, 'result'));
    if (JSON.stringify(artifact).includes(PREFERRED_FORMAT)) {
      throw new PrecompileError(
        'Internal: the preferred canvas format was used outside of render pipeline targets.',
      );
    }
    return { artifact, async: isAsync, warnings: capturer.warnings };
  } finally {
    recordingNavigator.restore();
  }
}
