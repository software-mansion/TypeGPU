import type { AttachContext, Codec, ResourceRef, Tables } from '../artifact.ts';
import { hydrateCodec, type RuntimeArrayCodec } from './codecs.ts';
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

/** Objects shared by every root a precompiled result is attached to */
interface Shared {
  layouts: PrunedLayout[];
  vertexLayouts: PrunedVertexLayout[];
}

/** The tables with every codec ready to read and write */
type RuntimeTables = Omit<Tables, 'codecs'> & { readonly codecs: Codec[] };

function createContext(tables: RuntimeTables, shared: Shared, root: PrunedRoot): AttachContext {
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
  };

  const compute = memo((id) => new PrunedComputePipeline(host, at(tables.computePipelines, id)));

  return {
    codec: (id) => at(tables.codecs, id),
    arrayOf: (id) => {
      const codec = at(tables.codecs, id) as Partial<RuntimeArrayCodec>;
      if (!codec.ofLength) {
        throw new Error(
          `[@typegpu/prune] Precompiled codec #${id} is not of a runtime-sized array.`,
        );
      }
      return codec.ofLength;
    },
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
  emitted: Tables,
  build: (ctx: AttachContext) => T,
  isAsync: boolean,
): (root: PrunedRoot) => unknown {
  const tables: RuntimeTables = { ...emitted, codecs: emitted.codecs.map(hydrateCodec) };
  const shared: Shared = {
    layouts: tables.layouts.map((layout) => new PrunedLayout(layout.keys, layout.entries)),
    vertexLayouts: tables.vertexLayouts.map(
      (layout) => new PrunedVertexLayout(layout.arrayStride, layout.stepMode),
    ),
  };
  const results = new WeakMap<PrunedRoot, T>();

  return (root) => {
    let result = results.get(root);
    if (result === undefined) {
      result = build(createContext(tables, shared, root));
      results.set(root, result);
    }
    return isAsync ? Promise.resolve(result) : result;
  };
}
