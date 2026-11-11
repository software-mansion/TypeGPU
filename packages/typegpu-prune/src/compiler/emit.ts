import { buildReader, buildWriter, deserializeDataSchema } from 'typegpu/~internal';
import type {
  ArrayCodecArtifact,
  Artifact,
  ComputePipelineArtifact,
  RenderPipelineArtifact,
  ScalarKind,
  SchemaArtifact,
  SurfaceNode,
} from '../artifact.ts';
import { PrecompileError } from './capture.ts';

export interface EmitOptions {
  async: boolean;
}

function literal(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

const SCALARS: readonly string[] = ['f32', 'f16', 'u32', 'i32'] satisfies ScalarKind[];

function isScalarKind(key: string): key is ScalarKind {
  return SCALARS.includes(key);
}

function isScalarElement(described: SchemaArtifact): boolean {
  return described.type === 'd' && isScalarKind(described.key);
}

/**
 * The codec of a schema as code. `link` gives the index into `codecs` of another schema, which
 * every element of a runtime-sized array is given as its `elementType`.
 */
function codec(described: SchemaArtifact, link: (schema: number) => number): string {
  // Texture schemas carry what creating a view of them needs
  if (described.type === 'sampled-texture' || described.type === 'storage-texture') {
    const format = described.type === 'storage-texture' ? described.format : undefined;
    return `{ size: 0, align: 0, dimension: ${JSON.stringify(described.dimension)}${
      format !== undefined ? `, format: ${JSON.stringify(format)}` : ''
    } }`;
  }
  // Runtime-sized arrays are data, each length read and written per element by the runtime
  if ((described.type === 'array' || described.type === 'disarray') && described.count === 0) {
    const element = described.element as SchemaArtifact;
    const elementCodec = isScalarElement(element)
      ? JSON.stringify((element as { key: string }).key)
      : codec(element, link);
    const elementType =
      described.elementSchema !== undefined
        ? `, elementType: ${link(described.elementSchema)}`
        : '';
    return `{ size: 0, align: ${described.align}, runtimeArray: { element: ${elementCodec}, stride: ${described.stride ?? 0}${elementType} } }`;
  }
  // Fixed-size arrays of scalars are data, read and written by the runtime's array codec
  if (
    described.type === 'array' &&
    described.count > 0 &&
    described.element.type === 'd' &&
    isScalarKind(described.element.key)
  ) {
    const array: ArrayCodecArtifact['array'] = {
      element: described.element.key,
      count: described.count,
      stride: described.stride ?? 0,
    };
    return `{ size: ${described.size}, align: ${described.align}, array: { element: ${JSON.stringify(array.element)}, count: ${array.count}, stride: ${array.stride} } }`;
  }
  const schema = deserializeDataSchema(described);
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
  return `{ size: ${described.size}, align: ${described.align}, write: ${write}, read: ${read} }`;
}

function runtimePipeline({
  immediate: _immediate,
  logs: _logs,
  targetKeys: _targetKeys,
  ...rest
}: ComputePipelineArtifact & Partial<RenderPipelineArtifact>): object {
  return rest;
}

export function emit(artifact: Artifact, options: EmitOptions): string {
  const codecIds = new Map<number, number>();
  const codecOf = (schema: number) => {
    let id = codecIds.get(schema);
    if (id === undefined) {
      id = codecIds.size;
      codecIds.set(schema, id);
    }
    return id;
  };
  const buffers = artifact.buffers.map((buffer) =>
    buffer.codec === undefined ? buffer : { ...buffer, codec: codecOf(buffer.codec) },
  );

  const rejectImmediate = (pipeline: { immediate?: unknown } | undefined, path: string) => {
    if (pipeline?.immediate) {
      throw new PrecompileError(`${path}: immediates are not supported yet.`);
    }
  };

  const expression = (node: SurfaceNode, path: string): string => {
    switch (node.kind) {
      case 'object':
        return `{ ${Object.entries(node.entries)
          .map(([key, item]) => `${JSON.stringify(key)}: ${expression(item, `${path}.${key}`)}`)
          .join(', ')} }`;
      case 'array':
        return `[${node.items.map((item, idx) => expression(item, `${path}[${idx}]`)).join(', ')}]`;
      case 'value':
        return literal(node.value);
      case 'number':
        return node.value;
      case 'undefined':
        return 'undefined';
      case 'bigint':
        return `${node.value}n`;
      case 'typedArray':
        return `new ${node.type}(${JSON.stringify(node.values)})`;
      case 'schema':
        return `c.codec(${codecOf(node.id)})`;
      case 'arrayOf':
        return `c.arrayOf(${codecOf(node.id)})`;
      case 'buffer':
        return `c.buffer(${node.id})`;
      case 'sampler':
        return `c.sampler(${node.id})`;
      case 'layout':
        exposedLayouts.add(node.id);
        return `c.layout(${node.id})`;
      case 'bindGroup':
        return `c.bindGroup(${node.id})`;
      case 'vertexLayout':
        return `c.vertexLayout(${node.id})`;
      case 'computePipeline':
        rejectImmediate(artifact.computePipelines[node.id], path);
        return `c.compute(${node.id})`;
      case 'guardedPipeline':
        rejectImmediate(
          artifact.computePipelines[artifact.guardedPipelines[node.id]?.pipeline ?? -1],
          path,
        );
        return `c.guarded(${node.id})`;
      case 'renderPipeline':
        rejectImmediate(artifact.renderPipelines[node.id], path);
        return `c.render(${node.id})`;
    }
  };
  const exposedLayouts = new Set<number>();
  const value = expression(artifact.surface, 'result');

  // Layouts returned from the arrow carry their entries' schemas, as `layout.entries` in TypeGPU
  const layouts = artifact.layouts.map(({ keys, entries, schemas }, id) =>
    exposedLayouts.has(id) && schemas
      ? {
          keys,
          entries,
          schemas: schemas.map((schema) => (schema === null ? null : codecOf(schema))),
        }
      : { keys, entries },
  );

  // Linking an element can add codecs, which the iteration still visits
  const codecs: string[] = [];
  for (const id of codecIds.keys()) {
    codecs.push(codec(artifact.schemas[id] as SchemaArtifact, codecOf));
  }
  const tables = `{
  codecs: [${codecs.join(',\n')}],
  shaders: ${JSON.stringify(artifact.shaders)},
  buffers: ${JSON.stringify(buffers)},
  samplers: ${JSON.stringify(artifact.samplers)},
  layouts: ${JSON.stringify(layouts)},
  bindGroups: ${JSON.stringify(artifact.bindGroups)},
  vertexLayouts: ${JSON.stringify(
    artifact.vertexLayouts.map(({ arrayStride, stepMode }) => ({ arrayStride, stepMode })),
  )},
  computePipelines: ${JSON.stringify(artifact.computePipelines.map(runtimePipeline))},
  guardedPipelines: ${JSON.stringify(artifact.guardedPipelines)},
  renderPipelines: ${JSON.stringify(artifact.renderPipelines.map(runtimePipeline))},
}`;
  return `__tgpuPruneAttach(${tables}, (c) => (${value}), ${options.async})`;
}
