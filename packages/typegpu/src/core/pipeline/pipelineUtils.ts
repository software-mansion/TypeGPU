import type { IndirectFlag, TgpuBuffer } from '../buffer/buffer.ts';
import { memoryLayoutOf, type PrimitiveOffsetInfo } from '../../data/offsetUtils.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import type { BaseData } from '../../data/wgslTypes.ts';
import type { TgpuBindGroup, TgpuBindGroupLayout } from '../../tgpuBindGroupLayout.ts';
import type { TgpuVertexLayout } from '../vertexLayout/vertexLayout.ts';
import { isGPUBuffer } from '../../types.ts';
import type { Timeable, TimestampWritesPriors } from './timeable.ts';

export function collectBindGroupPairs(
  layouts: TgpuBindGroupLayout[],
  catchall: [number, TgpuBindGroup] | undefined,
  map: Map<TgpuBindGroupLayout, TgpuBindGroup | GPUBindGroup> | undefined,
): [TgpuBindGroupLayout, TgpuBindGroup | GPUBindGroup][] {
  return layouts.flatMap((layout, idx): [TgpuBindGroupLayout, TgpuBindGroup | GPUBindGroup][] => {
    const resource = catchall && idx === catchall[0] ? catchall[1] : map?.get(layout);
    return resource ? [[layout, resource]] : [];
  });
}

export function collectVertexBufferPairs<Buffer>(
  layouts: TgpuVertexLayout[],
  map: Map<TgpuVertexLayout, Buffer> | undefined,
): [TgpuVertexLayout, Buffer][] {
  return layouts.flatMap((layout): [TgpuVertexLayout, Buffer][] => {
    const resource = map?.get(layout);
    return resource ? [[layout, resource]] : [];
  });
}

export function restoreTimestampPriors<T extends Timeable>(
  pipeline: T,
  priors: {
    readonly timestampWrites: TimestampWritesPriors['timestampWrites'] | undefined;
    readonly performanceCallback: TimestampWritesPriors['performanceCallback'] | undefined;
  },
): T {
  let result = pipeline;
  if (priors.timestampWrites) {
    result = result.withTimestampWrites(priors.timestampWrites);
  }
  if (priors.performanceCallback) {
    result = result.withPerformanceCallback(priors.performanceCallback);
  }
  return result;
}

type IndirectOperation = 'dispatchWorkgroupsIndirect' | 'drawIndirect' | 'drawIndexedIndirect';
const IndirectOperationToRequiredData = {
  dispatchWorkgroupsIndirect: '3 x u32',
  drawIndirect: '4 x u32',
  drawIndexedIndirect: '3 x u32, i32, u32',
} as const satisfies Record<IndirectOperation, string>;

function validateIndirectBufferSize(
  bufferSize: number,
  offset: number,
  requiredBytes: number,
  operation: IndirectOperation,
): void {
  if (offset + requiredBytes > bufferSize) {
    throw new Error(
      `Buffer too small for ${operation}. Required: ${requiredBytes} bytes at offset ${offset}, but buffer is only ${bufferSize} bytes.`,
    );
  }

  if (offset % 4 !== 0) {
    throw new Error(`Indirect buffer offset must be a multiple of 4. Got: ${offset}`);
  }
}

export function resolveIndirectOffset(
  indirectBuffer: (TgpuBuffer<BaseData> & IndirectFlag) | GPUBuffer,
  start: PrimitiveOffsetInfo | number | undefined,
  requiredSize: number,
  operation: IndirectOperation,
): number {
  if (isGPUBuffer(indirectBuffer)) {
    const offset = typeof start === 'number' ? start : (start?.offset ?? 0);
    validateIndirectBufferSize(indirectBuffer.size, offset, requiredSize, operation);
    return offset;
  }

  const offsetInfo = start
    ? typeof start === 'number'
      ? { offset: start, contiguous: requiredSize }
      : start
    : memoryLayoutOf(indirectBuffer.dataType);

  const { offset, contiguous } = offsetInfo;

  validateIndirectBufferSize(sizeOf(indirectBuffer.dataType), offset, requiredSize, operation);

  if (contiguous < requiredSize) {
    console.warn(
      `${operation}: Starting at offset ${offset}, only ${contiguous} contiguous bytes are available before padding. '${operation}' requires ${requiredSize} bytes (${IndirectOperationToRequiredData[operation]}). Reading across padding may result in undefined behavior.`,
    );
  }

  return offset;
}
