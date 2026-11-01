/**
 * Runs a `precompile()` arrow on a recording root and turns its result into JS code
 * for the pruned runtime. Bundled together with the user's arrow by the evaluator,
 * so that it shares the same `typegpu` instance.
 */

import { d, tgpu, type TgpuRoot } from 'typegpu';
import { buildReader, buildWriter, snapshotResource } from 'typegpu/~internal';
import {
  type BindGroupArtifact,
  type BufferArtifact,
  type ComputePipelineArtifact,
  type GroupArtifact,
  type GuardedPipelineArtifact,
  HOLE_PREFIX,
  HOLE_SUFFIX,
  type LayoutArtifact,
  type RenderPipelineArtifact,
  type ResourceRef,
  type VertexLayoutArtifact,
} from '../artifact.ts';
import {
  createRecordingDevice,
  installWebGPUGlobals,
  type RecordedBuffer,
  recordOf,
} from './recordingDevice.ts';

export interface SerializeOptions {
  features?: GPUFeatureName[] | undefined;
}

export interface SerializeResult {
  /** An expression calling `__tgpuPruneAttach`, to replace the `precompile()` call with */
  code: string;
  warnings: string[];
}

export class PrecompileError extends Error {
  constructor(message: string) {
    super(`[@typegpu/prune] ${message}`);
    this.name = 'PrecompileError';
  }
}

const holePattern = new RegExp(`${HOLE_PREFIX}(.*?)${HOLE_SUFFIX}`, 'g');

function holeNames(text: string): string[] {
  return [...text.matchAll(holePattern)].map((match) => match[1] as string);
}

/** Replaces hole tokens inside of a descriptor with `{ $hole }` markers */
function markHoles(value: unknown): unknown {
  if (typeof value === 'string') {
    const names = holeNames(value);
    if (names.length === 0) {
      return value;
    }
    if (value !== `${HOLE_PREFIX}${names[0]}${HOLE_SUFFIX}`) {
      throw new PrecompileError(
        `Runtime value '${names[0]}' was combined with other values at build time. It can only be passed through as-is.`,
      );
    }
    return { $hole: names[0] };
  }
  if (Array.isArray(value)) {
    return value.map(markHoles);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, markHoles(item)]));
  }
  return value;
}

function createHoles(accessed: Set<string>): Record<string, string> {
  return new Proxy({} as Record<string, string>, {
    get(_, key) {
      if (typeof key !== 'string') {
        return undefined;
      }
      accessed.add(key);
      return `${HOLE_PREFIX}${key}${HOLE_SUFFIX}`;
    },
  });
}

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

function literal(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'bigint') {
    return `${value}n`;
  }
  return JSON.stringify(value);
}

/** Like `JSON.stringify`, but keeps `undefined` out and tolerates recorded objects by refusing them */
function data(value: unknown): string {
  return JSON.stringify(value, (_, item) => {
    if (recordOf(item)) {
      throw new PrecompileError('Internal: a GPU object leaked into serialized data.');
    }
    return item;
  });
}

class Serializer {
  readonly root: TgpuRoot;
  readonly warnings: string[] = [];

  readonly codecs: string[] = [];
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

  codec(schema: d.BaseData): number {
    return this.#memo(schema, this.codecs, () => {
      const size = d.sizeOf(schema as d.AnyData);
      const align = d.alignmentOf(schema as d.AnyData);
      let write = 'undefined';
      let read = 'undefined';
      try {
        const full = buildWriter(schema, 'offset', 'value', 0, false);
        const partial = buildWriter(schema, 'offset', 'value', 0, true);
        write = `function (output, offset, value, littleEndian = true, endOffset = output.byteLength) {\nif (offset > 0 || endOffset < output.byteLength) {\n${partial}} else {\n${full}}\n}`;
      } catch {
        // Not every schema can be written by a generated writer (e.g. runtime-sized arrays)
      }
      try {
        read = `function (input, offset, littleEndian = true) {\nreturn ${buildReader(schema, 'offset')};\n}`;
      } catch {
        // Same as above
      }
      return `{ size: ${size}, align: ${align}, write: ${write}, read: ${read} }`;
    });
  }

  shader(code: string, owner: string): number {
    const holes = holeNames(code);
    if (holes.length > 0) {
      throw new PrecompileError(
        `Runtime value '${holes[0]}' reached the shader code of ${owner}. ` +
          'Runtime values can only be used in settings that do not change the generated WGSL, like target formats.',
      );
    }
    return this.#memo(`shader:${code}`, this.shaders, () => code);
  }

  /** A buffer by its recorded GPU buffer, with the schema when it is known */
  rawBuffer(raw: RecordedBuffer, schema?: d.BaseData): number {
    const id = this.#memo(raw, this.buffers, () => ({
      size: raw.size,
      usage: raw.usage,
      bytes: toBase64(raw.shadow),
    }));
    const art = this.buffers[id] as BufferArtifact;
    if (schema && art.codec === undefined) {
      this.buffers[id] = { ...art, codec: this.codec(schema) };
    }
    return id;
  }

  buffer(buffer: { dataType: d.BaseData }): number {
    const raw = this.root.unwrap(buffer as never) as unknown as RecordedBuffer;
    return this.rawBuffer(raw, buffer.dataType);
  }

  rawSampler(raw: unknown): number {
    return this.#memo(raw, this.samplers, () => recordOf<GPUSamplerDescriptor>(raw)?.desc ?? {});
  }

  rawLayout(raw: unknown, keys?: (string | null)[]): number {
    return this.#memo(raw, this.layouts, () => {
      const desc = recordOf<GPUBindGroupLayoutDescriptor>(raw)?.desc;
      if (!desc) {
        throw new PrecompileError('Internal: expected a recorded bind group layout.');
      }
      const entries = [...desc.entries];
      return {
        keys: keys ?? entries.map(() => null),
        entries: entries.map(({ binding, visibility, ...rest }) => ({
          binding,
          visibility,
          ...rest,
        })),
      };
    });
  }

  layout(layout: { entries: Record<string, unknown> }): number {
    const raw = this.root.unwrap(layout as never);
    const keys = Object.entries(layout.entries).map(([key, entry]) =>
      entry === null ? null : key,
    );
    const id = this.rawLayout(raw, keys);
    // A layout first seen through a bind group has no keys yet
    const art = this.layouts[id] as LayoutArtifact;
    if (art.keys.every((key) => key === null)) {
      this.layouts[id] = { ...art, keys };
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

  vertexLayout(layout: { stride: number; stepMode: GPUVertexStepMode }): number {
    return this.#memo(layout, this.vertexLayouts, () => ({
      arrayStride: layout.stride,
      stepMode: layout.stepMode,
    }));
  }

  #groups(
    usedLayouts: ({ entries: Record<string, unknown> } | undefined)[] | undefined,
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

  computePipeline(pipeline: object, label: string): number {
    return this.#memo(pipeline, this.computePipelines, () => {
      const soul = snapshotResource(pipeline) as unknown as {
        raw: unknown;
        usedBindGroupLayouts?: { entries: Record<string, unknown> }[];
        bindGroups?: [unknown, unknown][];
        usedImmediate?: unknown;
      };
      if (soul.usedImmediate) {
        throw new PrecompileError(`${label}: immediates are not supported yet.`);
      }
      const desc = recordOf<GPUComputePipelineDescriptor>(soul.raw)?.desc;
      if (!desc) {
        throw new PrecompileError('Internal: expected a recorded compute pipeline.');
      }
      const code = recordOf<GPUShaderModuleDescriptor>(desc.compute.module)?.desc.code ?? '';
      return {
        shader: this.shader(code, label),
        ...(desc.compute.entryPoint !== undefined && { entryPoint: desc.compute.entryPoint }),
        groups: this.#groups(soul.usedBindGroupLayouts, soul.bindGroups),
      };
    });
  }

  guardedPipeline(pipeline: object, label: string): number {
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
        pipeline: this.computePipeline(soul.pipeline, label),
        sizeBuffer: this.buffer(sizeSoul.buffer),
        workgroupSize: Array.from(soul.workgroupSize) as [number, number, number],
      };
    });
  }

  renderPipeline(pipeline: object, label: string): number {
    return this.#memo(pipeline, this.renderPipelines, () => {
      const soul = snapshotResource(pipeline) as unknown as {
        raw: unknown;
        usedBindGroupLayouts?: { entries: Record<string, unknown> }[];
        bindGroups?: [unknown, unknown][];
        usedVertexLayouts?: { stride: number; stepMode: GPUVertexStepMode }[];
        vertexBuffers?: [{ stride: number; stepMode: GPUVertexStepMode }, unknown][];
        indexBuffer?: unknown;
        usedImmediate?: unknown;
      };
      if (soul.usedImmediate) {
        throw new PrecompileError(`${label}: immediates are not supported yet.`);
      }
      if (soul.indexBuffer) {
        throw new PrecompileError(
          `${label}: index buffers bound at build time are not supported yet. Bind them with .withIndexBuffer() at runtime.`,
        );
      }
      const desc = recordOf<GPURenderPipelineDescriptor>(soul.raw)?.desc;
      if (!desc) {
        throw new PrecompileError('Internal: expected a recorded render pipeline.');
      }
      const code = recordOf<GPUShaderModuleDescriptor>(desc.vertex.module)?.desc.code ?? '';
      const { module: _vertexModule, ...vertex } = desc.vertex;
      const fragment = desc.fragment
        ? (({ module: _fragmentModule, ...rest }) => rest)(desc.fragment)
        : undefined;

      return {
        shader: this.shader(code, label),
        groups: this.#groups(soul.usedBindGroupLayouts, soul.bindGroups),
        vertexSlots: (soul.usedVertexLayouts ?? []).map((layout) => this.vertexLayout(layout)),
        vertexBuffers: (soul.vertexBuffers ?? []).map(([layout, buffer]) => {
          const raw = (recordOf(buffer)
            ? buffer
            : this.root.unwrap(buffer as never)) as unknown as RecordedBuffer;
          const schema = (buffer as { dataType?: d.BaseData }).dataType;
          return [this.vertexLayout(layout), this.rawBuffer(raw, schema)] as [number, number];
        }),
        descriptor: markHoles(
          JSON.parse(
            data({
              vertex,
              fragment,
              primitive: desc.primitive,
              depthStencil: desc.depthStencil,
              multisample: desc.multisample,
            }),
          ),
        ) as RenderPipelineArtifact['descriptor'],
      };
    });
  }

  /** Turns the arrow's result into a JS expression over the attach context `c` */
  value(value: unknown, path: string): string {
    if (value === null || value === undefined || typeof value !== 'object') {
      if (typeof value === 'string' && holeNames(value).length > 0) {
        throw new PrecompileError(`${path}: runtime values can't be returned from precompile().`);
      }
      if (typeof value === 'function' && !d.isData(value)) {
        throw new PrecompileError(
          `${path}: functions can't be returned from precompile(). Return pipelines built from them instead.`,
        );
      }
      if (typeof value === 'symbol') {
        throw new PrecompileError(`${path}: symbols can't be returned from precompile().`);
      }
      if (!d.isData(value)) {
        return literal(value);
      }
    }

    if (d.isData(value)) {
      return `c.codec(${this.codec(value as d.BaseData)})`;
    }
    if (Array.isArray(value)) {
      return `[${value.map((item, idx) => this.value(item, `${path}[${idx}]`)).join(', ')}]`;
    }
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      return `new ${value.constructor.name}(${data(Array.from(value as unknown as ArrayLike<number>))})`;
    }

    const resourceType = (value as { resourceType?: string }).resourceType;
    switch (resourceType) {
      case 'buffer':
        return `c.buffer(${this.buffer(value as { dataType: d.BaseData })})`;
      case 'uniform':
      case 'mutable':
      case 'readonly': {
        const soul = snapshotResource(value) as unknown as { buffer: { dataType: d.BaseData } };
        return `c.buffer(${this.buffer(soul.buffer)})`;
      }
      case 'sampler':
        return `c.sampler(${this.rawSampler(this.root.unwrap(value as never))})`;
      case 'bind-group-layout':
        return `c.layout(${this.layout(value as { entries: Record<string, unknown> })})`;
      case 'bind-group':
        return `c.bindGroup(${this.bindGroup(value)})`;
      case 'vertex-layout':
        return `c.vertexLayout(${this.vertexLayout(value as { stride: number; stepMode: GPUVertexStepMode })})`;
      case 'compute-pipeline':
        return `c.compute(${this.computePipeline(value, path)})`;
      case 'guarded-compute-pipeline':
        return `c.guarded(${this.guardedPipeline(value, path)})`;
      case 'render-pipeline':
        return `c.render(${this.renderPipeline(value, path)})`;
      case undefined:
        break;
      default:
        throw new PrecompileError(`${path}: '${resourceType}' can't be precompiled yet.`);
    }

    if (isPlainObject(value)) {
      const props = Object.entries(value).map(
        ([key, item]) => `${JSON.stringify(key)}: ${this.value(item, `${path}.${key}`)}`,
      );
      return `{ ${props.join(', ')} }`;
    }

    throw new PrecompileError(
      `${path}: ${Object.prototype.toString.call(value)} can't be returned from precompile().`,
    );
  }

  tables(): string {
    return `{
  codecs: [${this.codecs.join(',\n')}],
  shaders: ${data(this.shaders)},
  buffers: ${data(this.buffers)},
  samplers: ${data(this.samplers)},
  layouts: ${data(this.layouts)},
  bindGroups: ${data(this.bindGroups)},
  vertexLayouts: ${data(this.vertexLayouts)},
  computePipelines: ${data(this.computePipelines)},
  guardedPipelines: ${data(this.guardedPipelines)},
  renderPipelines: ${data(this.renderPipelines)},
}`;
  }
}

export async function serializePrecompiled(
  fn: (root: TgpuRoot, holes: Record<string, unknown>) => unknown,
  options: SerializeOptions = {},
): Promise<SerializeResult> {
  installWebGPUGlobals();

  const device = createRecordingDevice(options.features ?? []);
  const root = tgpu.initFromDevice({
    device,
    unstable_minify: true,
    unstable_logOptions: { stripLogs: true },
  });

  const accessedHoles = new Set<string>();
  try {
    const pending = fn(root, createHoles(accessedHoles));
    const isAsync = pending instanceof Promise;
    const result = await pending;

    const serializer = new Serializer(root);
    const value = serializer.value(result, 'result');

    return {
      code: `__tgpuPruneAttach(${serializer.tables()}, (c) => (${value}), ${isAsync})`,
      warnings: serializer.warnings,
    };
  } catch (error) {
    if (error instanceof PrecompileError || accessedHoles.size === 0) {
      throw error;
    }
    // At build time, runtime values are placeholder strings, which TypeGPU often rejects first
    const names = [...accessedHoles].map((name) => `'${name}'`).join(', ');
    throw new PrecompileError(
      `${error instanceof Error ? error.message : String(error)}\n` +
        `This may be caused by a runtime value (${names}) being used where it changes the generated WGSL. ` +
        'Runtime values can only be used in settings like target formats.',
    );
  }
}
