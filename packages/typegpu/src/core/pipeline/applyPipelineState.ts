import {
  isBindGroup,
  type TgpuBindGroup,
  type TgpuBindGroupLayout,
} from '../../tgpuBindGroupLayout.ts';
import { type TgpuBuffer, type VertexFlag } from '../buffer/buffer.ts';
import { isBuffer } from '../../types.ts';
import { MissingBindGroupsError, MissingVertexBuffersError } from '../../errors.ts';
import type { BaseData } from '../../data/wgslTypes.ts';

import type { TgpuVertexLayout } from '../vertexLayout/vertexLayout.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';

// -----------------------------------------------
// shared helpers for applying pipeline state to render/compute pass encoders
// -----------------------------------------------

export type BindGroupResolver = (
  layout: TgpuBindGroupLayout,
) => TgpuBindGroup | GPUBindGroup | undefined;

export interface VertexBufferEntry {
  buffer: (TgpuBuffer<BaseData> & VertexFlag) | GPUBuffer;
  offset?: number | undefined;
  size?: number | undefined;
}

export type VertexBufferResolver = (layout: TgpuVertexLayout) => VertexBufferEntry | undefined;

export interface IndexBufferEntry {
  buffer: TgpuBuffer<BaseData> | GPUBuffer;
  indexFormat: GPUIndexFormat;
  offsetBytes?: number | undefined;
  sizeBytes?: number | undefined;
}

export function applyIndexBuffer(
  encoder: GPURenderPassEncoder | GPURenderBundleEncoder,
  root: ExperimentalTgpuRoot,
  entry: IndexBufferEntry,
): void {
  const { buffer, indexFormat, offsetBytes, sizeBytes } = entry;
  if (isBuffer(buffer)) {
    encoder.setIndexBuffer(root.unwrap(buffer), indexFormat, offsetBytes, sizeBytes);
  } else {
    encoder.setIndexBuffer(buffer, indexFormat, offsetBytes, sizeBytes);
  }
}

export function applyBindGroups(
  encoder: GPURenderPassEncoder | GPURenderBundleEncoder | GPUComputePassEncoder,
  root: ExperimentalTgpuRoot,
  usedBindGroupLayouts: TgpuBindGroupLayout[],
  catchall: [number, TgpuBindGroup] | undefined,
  resolveBindGroup: BindGroupResolver,
): void {
  const missingBindGroups = new Set(usedBindGroupLayouts);

  usedBindGroupLayouts.forEach((layout, idx) => {
    if (catchall && idx === catchall[0]) {
      encoder.setBindGroup(idx, root.unwrap(catchall[1]));
      missingBindGroups.delete(layout);
    } else {
      const bindGroup = resolveBindGroup(layout);
      if (bindGroup !== undefined) {
        missingBindGroups.delete(layout);
        if (isBindGroup(bindGroup)) {
          encoder.setBindGroup(idx, root.unwrap(bindGroup));
        } else {
          encoder.setBindGroup(idx, bindGroup);
        }
      }
    }
  });

  if (missingBindGroups.size > 0) {
    throw new MissingBindGroupsError(missingBindGroups);
  }
}

export function applyVertexBuffers(
  encoder: GPURenderPassEncoder | GPURenderBundleEncoder,
  root: ExperimentalTgpuRoot,
  usedVertexLayouts: TgpuVertexLayout[],
  resolveVertexBuffer: VertexBufferResolver,
): void {
  const missingVertexLayouts = new Set<TgpuVertexLayout>();

  usedVertexLayouts.forEach((vertexLayout, idx) => {
    const entry = resolveVertexBuffer(vertexLayout);
    if (!entry || !entry.buffer) {
      missingVertexLayouts.add(vertexLayout);
    } else if (isBuffer(entry.buffer)) {
      encoder.setVertexBuffer(idx, root.unwrap(entry.buffer), entry.offset, entry.size);
    } else {
      encoder.setVertexBuffer(idx, entry.buffer, entry.offset, entry.size);
    }
  });

  if (missingVertexLayouts.size > 0) {
    throw new MissingVertexBuffersError(missingVertexLayouts);
  }
}
