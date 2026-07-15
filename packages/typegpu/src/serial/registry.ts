import {
  INTERNAL_applyBufferUsages,
  INTERNAL_restoreBuffer,
  INTERNAL_snapshotBuffer,
  type TgpuBufferSnapshot,
} from '../core/buffer/buffer.ts';
import { isBuffer } from '../types.ts';
import { isBufferBinding, type TgpuBufferBinding } from '../core/buffer/bufferBinding.ts';
import type { AnyWgslData, BaseData } from '../data/wgslTypes.ts';
import { deserializeDataSchema } from './schema.ts';
import {
  INTERNAL_restoreComputePipeline,
  INTERNAL_snapshotComputePipeline,
  type TgpuComputePipelineSnapshot,
} from '../core/pipeline/computePipeline.ts';
import {
  INTERNAL_restoreRenderPipeline,
  INTERNAL_snapshotRenderPipeline,
  type TgpuRenderPipelineSnapshot,
} from '../core/pipeline/renderPipeline.ts';
import { isComputePipeline, isRenderPipeline } from '../core/pipeline/typeGuards.ts';
import {
  INTERNAL_restoreQuerySet,
  INTERNAL_snapshotQuerySet,
  isQuerySet,
  type TgpuQuerySetSnapshot,
} from '../core/querySet/querySet.ts';
import {
  INTERNAL_restoreConst,
  INTERNAL_snapshotConst,
  isConst,
  type TgpuConstSnapshot,
} from '../core/constant/tgpuConstant.ts';
import {
  INTERNAL_restoreGuardedComputePipeline,
  INTERNAL_restoreRoot,
  INTERNAL_snapshotGuardedComputePipeline,
  INTERNAL_snapshotRoot,
  isGuardedComputePipeline,
  isRoot,
  type TgpuGuardedComputePipelineSnapshot,
  type TgpuRootSnapshot,
} from '../core/root/init.ts';
import {
  INTERNAL_restoreAccessor,
  INTERNAL_snapshotAccessor,
  type TgpuAccessorSnapshot,
} from '../core/slot/accessor.ts';
import {
  INTERNAL_restoreSlot,
  INTERNAL_snapshotSlot,
  type TgpuSlotSnapshot,
} from '../core/slot/slot.ts';
import { isAccessor, isMutableAccessor, isSlot } from '../core/slot/slotTypes.ts';
import {
  INTERNAL_isSnapshotableSampler,
  INTERNAL_restoreSampler,
  INTERNAL_snapshotSampler,
  type TgpuSamplerSnapshot,
} from '../core/sampler/sampler.ts';
import {
  INTERNAL_restoreDataValue,
  INTERNAL_snapshotDataValue,
  isSnapshotableDataValue,
  type TgpuDataValueSnapshot,
} from './dataValue.ts';
import { $internal } from '../shared/symbols.ts';
import {
  INTERNAL_restoreTexture,
  INTERNAL_snapshotTexture,
  isTexture,
  type TgpuTextureSnapshot,
} from '../core/texture/texture.ts';
import {
  INTERNAL_restoreVertexLayout,
  INTERNAL_snapshotVertexLayout,
  isVertexLayout,
  type TgpuVertexLayoutSnapshot,
} from '../core/vertexLayout/vertexLayout.ts';
import {
  INTERNAL_restoreBindGroup,
  INTERNAL_restoreBindGroupLayout,
  INTERNAL_snapshotBindGroup,
  INTERNAL_snapshotBindGroupLayout,
  isBindGroup,
  isBindGroupLayout,
  type TgpuBindGroupLayoutSnapshot,
  type TgpuBindGroupSnapshot,
} from '../tgpuBindGroupLayout.ts';
import type { RestoreContext } from './types.ts';

/** Plain objects that make a resource recreatable in another JS runtime sharing the same device */
export type TgpuResourceSnapshot =
  | TgpuBufferSnapshot
  | TgpuBufferBindingSnapshot
  | TgpuTextureSnapshot
  | TgpuBindGroupSnapshot
  | TgpuBindGroupLayoutSnapshot
  | TgpuVertexLayoutSnapshot
  | TgpuQuerySetSnapshot
  | TgpuComputePipelineSnapshot
  | TgpuRenderPipelineSnapshot
  | TgpuGuardedComputePipelineSnapshot
  | TgpuRootSnapshot
  | TgpuSlotSnapshot
  | TgpuAccessorSnapshot
  | TgpuConstSnapshot
  | TgpuSamplerSnapshot
  | TgpuDataValueSnapshot;

// Derived from the snapshot union, so a snapshot type with no snapshotter below fails to compile
export type TransferableResourceType = TgpuResourceSnapshot['type'];

// Unlike `Extract`, this matches snapshotters shared between resource types (e.g. buffer bindings)
type SnapshotFor<K extends TransferableResourceType, T = TgpuResourceSnapshot> = T extends {
  type: infer Type;
}
  ? K extends Type
    ? T
    : never
  : never;

type SnapshotterContract = {
  [K in TransferableResourceType]: {
    is(value: unknown): boolean;
    snapshot(resource: never): SnapshotFor<K>;
    restore(snapshot: never, ctx: RestoreContext): unknown;
  };
};

export interface TgpuBufferBindingSnapshot {
  readonly type: 'uniform' | 'mutable' | 'readonly';
  readonly device: GPUDevice;
  readonly buffer: TgpuBufferSnapshot;
}

export function INTERNAL_snapshotBufferBinding(
  binding: TgpuBufferBinding<BaseData>,
): TgpuBufferBindingSnapshot {
  return {
    type: binding.resourceType,
    device: binding.buffer.root.device,
    buffer: INTERNAL_snapshotBuffer(binding.buffer),
  };
}

export function INTERNAL_restoreBufferBinding(
  snapshot: TgpuBufferBindingSnapshot,
  ctx: RestoreContext,
): TgpuBufferBinding<AnyWgslData> {
  const root = ctx.getRoot(snapshot.device);
  const schema = deserializeDataSchema(snapshot.buffer.schema) as AnyWgslData;
  const rawBuffer = snapshot.buffer.buffer;
  const binding =
    snapshot.type === 'uniform'
      ? root.createUniform(schema, rawBuffer)
      : snapshot.type === 'mutable'
        ? root.createMutable(schema, rawBuffer)
        : root.createReadonly(schema, rawBuffer);
  INTERNAL_applyBufferUsages(binding.buffer, snapshot.buffer.usages);
  return binding;
}

const bufferBindingSnapshotter = {
  is: isBufferBinding,
  snapshot: INTERNAL_snapshotBufferBinding,
  restore: INTERNAL_restoreBufferBinding,
};

export const resourceSnapshotters = {
  buffer: {
    is: isBuffer,
    snapshot: INTERNAL_snapshotBuffer,
    restore: INTERNAL_restoreBuffer,
  },
  uniform: bufferBindingSnapshotter,
  mutable: bufferBindingSnapshotter,
  readonly: bufferBindingSnapshotter,
  texture: {
    is: isTexture,
    snapshot: INTERNAL_snapshotTexture,
    restore: INTERNAL_restoreTexture,
  },
  'bind-group': {
    is: isBindGroup,
    snapshot: INTERNAL_snapshotBindGroup,
    restore: INTERNAL_restoreBindGroup,
  },
  'bind-group-layout': {
    is: isBindGroupLayout,
    snapshot: INTERNAL_snapshotBindGroupLayout,
    restore: INTERNAL_restoreBindGroupLayout,
  },
  'vertex-layout': {
    is: isVertexLayout,
    snapshot: INTERNAL_snapshotVertexLayout,
    restore: INTERNAL_restoreVertexLayout,
  },
  'query-set': {
    is: isQuerySet,
    snapshot: INTERNAL_snapshotQuerySet,
    restore: INTERNAL_restoreQuerySet,
  },
  'compute-pipeline': {
    is: isComputePipeline,
    snapshot: INTERNAL_snapshotComputePipeline,
    restore: INTERNAL_restoreComputePipeline,
  },
  'render-pipeline': {
    is: isRenderPipeline,
    snapshot: INTERNAL_snapshotRenderPipeline,
    restore: INTERNAL_restoreRenderPipeline,
  },
  'guarded-compute-pipeline': {
    is: isGuardedComputePipeline,
    snapshot: INTERNAL_snapshotGuardedComputePipeline,
    restore: INTERNAL_restoreGuardedComputePipeline,
  },
  root: {
    is: isRoot,
    snapshot: INTERNAL_snapshotRoot,
    restore: INTERNAL_restoreRoot,
  },
  slot: {
    is: isSlot,
    snapshot: INTERNAL_snapshotSlot,
    restore: INTERNAL_restoreSlot,
  },
  accessor: {
    is: isAccessor,
    snapshot: INTERNAL_snapshotAccessor,
    restore: INTERNAL_restoreAccessor,
  },
  'mutable-accessor': {
    is: isMutableAccessor,
    snapshot: INTERNAL_snapshotAccessor,
    restore: INTERNAL_restoreAccessor,
  },
  const: {
    is: isConst,
    snapshot: INTERNAL_snapshotConst,
    restore: INTERNAL_restoreConst,
  },
  sampler: {
    is: INTERNAL_isSnapshotableSampler,
    snapshot: INTERNAL_snapshotSampler,
    restore: INTERNAL_restoreSampler,
  },
  'sampler-comparison': {
    is: INTERNAL_isSnapshotableSampler,
    snapshot: INTERNAL_snapshotSampler,
    restore: INTERNAL_restoreSampler,
  },
  // Vector/matrix instances have no `resourceType`, see `getSnapshotterFor`
  'data-value': {
    is: isSnapshotableDataValue,
    snapshot: INTERNAL_snapshotDataValue,
    restore: INTERNAL_restoreDataValue,
  },
} satisfies SnapshotterContract;

type LooseSnapshotter = {
  is(value: unknown): boolean;
  snapshot(resource: unknown): TgpuResourceSnapshot;
  restore(snapshot: TgpuResourceSnapshot, ctx: RestoreContext): unknown;
};

function getSnapshotterFor(value: unknown): LooseSnapshotter | undefined {
  const resourceType = (value as { resourceType?: unknown } | undefined)?.resourceType;
  const type =
    typeof resourceType === 'string'
      ? resourceType
      : isSnapshotableDataValue(value)
        ? 'data-value'
        : undefined;
  if (type === undefined || !(type in resourceSnapshotters)) {
    return undefined;
  }
  const snapshotter = (resourceSnapshotters as Record<string, LooseSnapshotter>)[type];
  return snapshotter?.is(value) ? snapshotter : undefined;
}

export function isSnapshotableResource(value: unknown): boolean {
  return getSnapshotterFor(value) !== undefined;
}

/** Whether the value is a TypeGPU object that {@link snapshotResource} does not support */
export function isNonTransferableResource(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    $internal in value &&
    getSnapshotterFor(value) === undefined
  );
}

export function snapshotResource(value: unknown): TgpuResourceSnapshot | undefined {
  return getSnapshotterFor(value)?.snapshot(value);
}

export function restoreResource(snapshot: TgpuResourceSnapshot, ctx: RestoreContext): unknown {
  return (resourceSnapshotters as Record<string, LooseSnapshotter>)[snapshot.type]?.restore(
    snapshot,
    ctx,
  );
}
