/**
 * Turns a captured `Artifact` into the JS a `precompile()` call is replaced with: the tables the
 * pruned runtime reads, with codecs generated from the artifact's schemas, and the code that
 * rebuilds the arrow's result from them.
 */

import { buildReader, buildWriter, deserializeDataSchema } from 'typegpu/~internal';
import type {
  Artifact,
  ComputePipelineArtifact,
  RenderPipelineArtifact,
  SurfaceNode,
} from '../artifact.ts';
import { PrecompileError } from './capture.ts';

export interface EmitOptions {
  /** Whether the arrow returned a promise, which the factory then returns too */
  async: boolean;
}

function literal(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

/** Read and write functions for a schema, as JS source */
function codec(artifact: Artifact['schemas'][number]): string {
  const schema = deserializeDataSchema(artifact);
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
  return `{ size: ${artifact.size}, align: ${artifact.align}, write: ${write}, read: ${read} }`;
}

/** What the pruned runtime reads of a pipeline: none of what only other hosts need */
function runtimePipeline(pipeline: ComputePipelineArtifact | RenderPipelineArtifact): object {
  const {
    immediate: _immediate,
    logs: _logs,
    targetKeys: _targetKeys,
    ...rest
  } = pipeline as RenderPipelineArtifact;
  return rest;
}

export function emit(artifact: Artifact, options: EmitOptions): string {
  // Only schemas the runtime moves values of get codecs, renumbered in order of use
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

  const unsupported = (
    pipeline: ComputePipelineArtifact | RenderPipelineArtifact | undefined,
    path: string,
  ) => {
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
      case 'buffer':
        return `c.buffer(${node.id})`;
      case 'sampler':
        return `c.sampler(${node.id})`;
      case 'layout':
        return `c.layout(${node.id})`;
      case 'bindGroup':
        return `c.bindGroup(${node.id})`;
      case 'vertexLayout':
        return `c.vertexLayout(${node.id})`;
      case 'computePipeline':
        unsupported(artifact.computePipelines[node.id], path);
        return `c.compute(${node.id})`;
      case 'guardedPipeline':
        unsupported(
          artifact.computePipelines[artifact.guardedPipelines[node.id]?.pipeline ?? -1],
          path,
        );
        return `c.guarded(${node.id})`;
      case 'renderPipeline':
        unsupported(artifact.renderPipelines[node.id], path);
        return `c.render(${node.id})`;
    }
  };
  const value = expression(artifact.surface, 'result');

  const schemas = [...codecIds.keys()].map((schema) => {
    const described = artifact.schemas[schema];
    if (!described) {
      throw new PrecompileError(`Internal: schema #${schema} is missing from the artifact.`);
    }
    return described;
  });
  const tables = `{
  codecs: [${schemas.map(codec).join(',\n')}],
  shaders: ${JSON.stringify(artifact.shaders)},
  buffers: ${JSON.stringify(buffers)},
  samplers: ${JSON.stringify(artifact.samplers)},
  layouts: ${JSON.stringify(artifact.layouts.map(({ keys, entries }) => ({ keys, entries })))},
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
