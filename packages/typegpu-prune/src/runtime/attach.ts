import type { AttachContext, Codec, ResourceRef, Tables } from '../artifact.ts';
import {
  PrunedComputePipeline,
  PrunedGuardedComputePipeline,
  PrunedRenderPipeline,
  type PipelineHost,
} from './pipelines.ts';
import {
  PrunedBindGroup,
  PrunedBuffer,
  PrunedLayout,
  type PrunedRoot,
  PrunedVertexLayout,
} from './root.ts';

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** A table entry, which the generated code guarantees to exist */
function at<T>(table: readonly T[], id: number): T {
  const entry = table[id];
  if (entry === undefined) {
    throw new Error(`[@typegpu/prune] Missing precompiled entry #${id}.`);
  }
  return entry;
}

function memo<T>(create: (id: number) => T): (id: number) => T {
  const cache: T[] = [];
  return (id) => (cache[id] ??= create(id));
}

function isHole(value: unknown): value is { $hole: string } {
  return typeof value === 'object' && value !== null && '$hole' in value;
}

function fillHoles(value: unknown, holes: Record<string, unknown>): unknown {
  if (isHole(value)) {
    if (!(value.$hole in holes)) {
      throw new Error(`[@typegpu/prune] Missing runtime value '${value.$hole}'.`);
    }
    return holes[value.$hole];
  }
  if (Array.isArray(value)) {
    return value.map((item) => fillHoles(item, holes));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, fillHoles(item, holes)]),
    );
  }
  return value;
}

/** Objects shared by every root a precompiled result is attached to */
interface Shared {
  layouts: PrunedLayout[];
  vertexLayouts: PrunedVertexLayout[];
}

function createContext(
  tables: Tables,
  shared: Shared,
  root: PrunedRoot,
  holes: Record<string, unknown>,
): AttachContext {
  const device = root.device;

  const buffer = memo((id) => {
    const art = at(tables.buffers, id);
    const codec: Codec =
      art.codec !== undefined ? at(tables.codecs, art.codec) : { size: art.size, align: 4 };
    return new PrunedBuffer(
      root,
      { ...codec, size: art.size },
      art.bytes !== undefined ? decodeBase64(art.bytes) : undefined,
      art.usage,
    );
  });

  const sampler = memo((id) => device.createSampler(tables.samplers[id]));

  const toResource = (ref: ResourceRef): GPUBindingResource =>
    'sampler' in ref ? sampler(ref.sampler) : { ...ref, buffer: buffer(ref.buffer).unwrap() };

  const bindGroup = memo((id) => {
    const art = at(tables.bindGroups, id);
    return new PrunedBindGroup(root, at(shared.layouts, art.layout), () =>
      art.entries.flatMap((ref, binding) => (ref ? [{ binding, resource: toResource(ref) }] : [])),
    );
  });

  const shaderModule = memo((id) => device.createShaderModule({ code: at(tables.shaders, id) }));

  const host: PipelineHost = {
    root,
    shaderModule,
    layoutObject: (id) => at(shared.layouts, id),
    bindGroup,
    buffer,
    vertexLayout: (id) => at(shared.vertexLayouts, id),
    fillHoles: <T>(value: T) => fillHoles(value, holes) as T,
  };

  const compute = memo((id) => new PrunedComputePipeline(host, at(tables.computePipelines, id)));

  return {
    codec: (id) => at(tables.codecs, id),
    buffer,
    sampler,
    layout: (id) => host.layoutObject(id),
    bindGroup,
    vertexLayout: (id) => host.vertexLayout(id),
    compute,
    guarded: memo((id) => {
      const art = at(tables.guardedPipelines, id);
      return new PrunedGuardedComputePipeline(
        compute(art.pipeline),
        buffer(art.sizeBuffer),
        art.workgroupSize,
      );
    }),
    render: memo((id) => new PrunedRenderPipeline(host, at(tables.renderPipelines, id))),
  };
}

/**
 * What a `precompile()` call is replaced with in a pruned build.
 * Returns a factory that rebuilds the arrow's result on top of a root.
 *
 * @internal Emitted by the build plugin, not meant to be called by hand.
 */
export function __tgpuPruneAttach<T>(
  tables: Tables,
  build: (ctx: AttachContext) => T,
  isAsync: boolean,
): (root: PrunedRoot, holes?: Record<string, unknown>) => unknown {
  const shared: Shared = {
    layouts: tables.layouts.map((layout) => new PrunedLayout(layout.keys, layout.entries)),
    vertexLayouts: tables.vertexLayouts.map(
      (layout) => new PrunedVertexLayout(layout.arrayStride, layout.stepMode),
    ),
  };
  const results = new WeakMap<PrunedRoot, Map<string, T>>();

  return (root, holes = {}) => {
    let perRoot = results.get(root);
    if (!perRoot) {
      perRoot = new Map();
      results.set(root, perRoot);
    }
    const key = JSON.stringify(holes);
    let result = perRoot.get(key);
    if (result === undefined) {
      result = build(createContext(tables, shared, root, holes));
      perRoot.set(key, result);
    }
    return isAsync ? Promise.resolve(result) : result;
  };
}
