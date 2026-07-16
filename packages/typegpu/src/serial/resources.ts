import {
  INTERNAL_applyBufferUsages,
  type TgpuBuffer,
  type UsageLiteral,
} from '../core/buffer/buffer.ts';
import { constant, type TgpuConst } from '../core/constant/tgpuConstant.ts';
import {
  INTERNAL_restoreRenderPipelineParts,
  INTERNAL_snapshotRenderPipelineParts,
  type TgpuRenderPipeline,
  type TgpuRenderPipelineSnapshotParts,
} from '../core/pipeline/renderPipeline.ts';
import { accessor, mutableAccessor } from '../core/slot/accessor.ts';
import type { TgpuAccessor, TgpuMutableAccessor } from '../core/slot/slotTypes.ts';
import { vertexLayout, type TgpuVertexLayout } from '../core/vertexLayout/vertexLayout.ts';
import { arrayOf } from '../data/array.ts';
import { disarrayOf } from '../data/disarray.ts';
import { isDisarray, type AnyData } from '../data/dataTypes.ts';
import { isWgslArray, type AnyWgslData, type BaseData } from '../data/wgslTypes.ts';
import {
  bindGroupLayout,
  type TgpuBindGroup,
  type TgpuBindGroupLayout,
} from '../tgpuBindGroupLayout.ts';
import {
  deserializeLayoutEntry,
  serializeLayoutEntry,
  type SerializedLayoutEntry,
} from './layoutEntries.ts';
import { deserializeDataSchema, serializeDataSchema, type SerializedDataSchema } from './schema.ts';
import type { RestoreContext } from './types.ts';

export interface TgpuBufferSnapshot {
  readonly type: 'buffer';
  readonly device: GPUDevice;
  readonly buffer: GPUBuffer;
  readonly schema: SerializedDataSchema;
  readonly usages: UsageLiteral[];
}

function getBufferUsages(buffer: TgpuBuffer<BaseData>): UsageLiteral[] {
  const usages: UsageLiteral[] = [];
  if (buffer.usableAsUniform) {
    usages.push('uniform');
  }
  if (buffer.usableAsStorage) {
    usages.push('storage');
  }
  if (buffer.usableAsVertex) {
    usages.push('vertex');
  }
  if (buffer.usableAsIndex) {
    usages.push('index');
  }
  if (buffer.usableAsIndirect) {
    usages.push('indirect');
  }
  return usages;
}

export function INTERNAL_snapshotBuffer(buffer: TgpuBuffer<BaseData>): TgpuBufferSnapshot {
  return {
    type: 'buffer',
    device: buffer.root.device,
    buffer: buffer.buffer,
    schema: serializeDataSchema(buffer.dataType),
    usages: getBufferUsages(buffer),
  };
}

export function INTERNAL_restoreBuffer(
  snapshot: TgpuBufferSnapshot,
  ctx: RestoreContext,
): TgpuBuffer<AnyData> {
  const root = ctx.getRoot(snapshot.device);
  const buffer = root.createBuffer(deserializeDataSchema(snapshot.schema), snapshot.buffer);
  INTERNAL_applyBufferUsages(buffer, snapshot.usages);
  return buffer;
}

export interface TgpuBindGroupLayoutSnapshot {
  readonly type: 'bind-group-layout';
  readonly entries: [string, SerializedLayoutEntry][];
  readonly index: number | undefined;
}

export function INTERNAL_snapshotBindGroupLayout(
  layout: TgpuBindGroupLayout,
): TgpuBindGroupLayoutSnapshot {
  return {
    type: 'bind-group-layout',
    entries: Object.entries(layout.entries).map(([key, entry]) => [
      key,
      serializeLayoutEntry(entry),
    ]),
    index: layout.index,
  };
}

export function INTERNAL_restoreBindGroupLayout(
  snapshot: TgpuBindGroupLayoutSnapshot,
): TgpuBindGroupLayout {
  const layout = bindGroupLayout(
    Object.fromEntries(
      snapshot.entries.map(([key, entry]) => [key, deserializeLayoutEntry(entry)]),
    ),
  );
  return layout.$idx(snapshot.index);
}

export interface TgpuBindGroupSnapshot {
  readonly type: 'bind-group';
  readonly device: GPUDevice;
  readonly layout: TgpuBindGroupLayout;
  readonly bindGroup: GPUBindGroup;
}

export function INTERNAL_snapshotBindGroup(bindGroup: TgpuBindGroup): TgpuBindGroupSnapshot {
  return {
    type: 'bind-group',
    device: bindGroup.root.device,
    layout: bindGroup.layout,
    bindGroup: bindGroup.root.unwrap(bindGroup),
  };
}

export function INTERNAL_restoreBindGroup(
  snapshot: TgpuBindGroupSnapshot,
  ctx: RestoreContext,
): TgpuBindGroup {
  const root = ctx.getRoot(snapshot.device);
  const bindGroup = snapshot.bindGroup;
  return {
    resourceType: 'bind-group',
    root,
    layout: snapshot.layout,
    unwrap: () => bindGroup,
  };
}

export interface TgpuVertexLayoutSnapshot {
  readonly type: 'vertex-layout';
  readonly schema: SerializedDataSchema;
  readonly stepMode: 'vertex' | 'instance';
}

export function INTERNAL_snapshotVertexLayout(layout: TgpuVertexLayout): TgpuVertexLayoutSnapshot {
  return {
    type: 'vertex-layout',
    schema: serializeDataSchema(layout.schemaForCount(0)),
    stepMode: layout.stepMode,
  };
}

export function INTERNAL_restoreVertexLayout(snapshot: TgpuVertexLayoutSnapshot): TgpuVertexLayout {
  const schema = deserializeDataSchema(snapshot.schema);
  if (isWgslArray(schema)) {
    const elementType = schema.elementType as AnyWgslData;
    return vertexLayout((count) => arrayOf(elementType, count), snapshot.stepMode);
  }
  if (isDisarray(schema)) {
    const elementType = schema.elementType as AnyData;
    return vertexLayout((count) => disarrayOf(elementType, count), snapshot.stepMode);
  }
  throw new Error('TypeGPU vertex layout payload could not be reconstructed.');
}

export interface TgpuConstSnapshot {
  readonly type: 'const';
  readonly schema: SerializedDataSchema;
  readonly value: unknown;
}

export function INTERNAL_snapshotConst(value: TgpuConst): TgpuConstSnapshot {
  const impl = value as TgpuConst & { dataType: AnyData };
  return {
    type: 'const',
    schema: serializeDataSchema(impl.dataType),
    value: impl.$,
  };
}

export function INTERNAL_restoreConst(snapshot: TgpuConstSnapshot): TgpuConst {
  return constant(deserializeDataSchema(snapshot.schema), snapshot.value);
}

export interface TgpuAccessorSnapshot {
  readonly type: 'accessor' | 'mutable-accessor';
  readonly schema: SerializedDataSchema;
  readonly defaultValue: unknown;
}

export function INTERNAL_snapshotAccessor(
  value: TgpuAccessor | TgpuMutableAccessor,
): TgpuAccessorSnapshot {
  return {
    type: value.resourceType,
    schema: serializeDataSchema(value.schema),
    defaultValue: value.defaultValue,
  };
}

export function INTERNAL_restoreAccessor(
  snapshot: TgpuAccessorSnapshot,
): TgpuAccessor | TgpuMutableAccessor {
  const schema = deserializeDataSchema(snapshot.schema);
  return snapshot.type === 'accessor'
    ? accessor(schema, snapshot.defaultValue)
    : mutableAccessor(schema, snapshot.defaultValue as TgpuMutableAccessor.In<AnyData>);
}

export interface TgpuRenderPipelineSnapshot extends Omit<
  TgpuRenderPipelineSnapshotParts,
  'fragmentOut'
> {
  readonly type: 'render-pipeline';
  readonly fragmentOut: SerializedDataSchema | undefined;
}

export function INTERNAL_snapshotRenderPipeline(
  pipeline: TgpuRenderPipeline,
): TgpuRenderPipelineSnapshot {
  const parts = INTERNAL_snapshotRenderPipelineParts(pipeline);
  return {
    ...parts,
    type: 'render-pipeline',
    fragmentOut: parts.fragmentOut ? serializeDataSchema(parts.fragmentOut) : undefined,
  };
}

export function INTERNAL_restoreRenderPipeline(
  snapshot: TgpuRenderPipelineSnapshot,
  ctx: RestoreContext,
): TgpuRenderPipeline {
  return INTERNAL_restoreRenderPipelineParts(
    {
      ...snapshot,
      fragmentOut: snapshot.fragmentOut ? deserializeDataSchema(snapshot.fragmentOut) : undefined,
    },
    ctx,
  );
}
