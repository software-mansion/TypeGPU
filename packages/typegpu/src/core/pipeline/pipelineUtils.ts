import type { IndirectFlag, TgpuBuffer } from '../buffer/buffer.ts';
import { memoryLayoutOf, type PrimitiveOffsetInfo } from '../../data/offsetUtils.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import type { BaseData } from '../../data/wgslTypes.ts';
import { isGPUBuffer } from '../../types.ts';

type IndirectOperation = 'dispatchWorkgroupsIndirect' | 'drawIndirect' | 'drawIndexedIndirect';
const IndirectOperationToRequiredData: Record<IndirectOperation, string> = {
  dispatchWorkgroupsIndirect: '3 x u32',
  drawIndirect: '4 x u32',
  drawIndexedIndirect: '3 x u32, i32, u32',
} as const;

function validateIndirectBufferSize(
  bufferSize: number,
  offset: number,
  requiredBytes: number,
  operation: IndirectOperation,
): void {
  if (offset + requiredBytes > bufferSize) {
    throw new Error(
      `Buffer too small for ${operation}. ` +
        `Required: ${requiredBytes} bytes at offset ${offset}, ` +
        `but buffer is only ${bufferSize} bytes.`,
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
    if ((indirectBuffer.usage & GPUBufferUsage.INDIRECT) !== GPUBufferUsage.INDIRECT) {
      throw new Error(`${operation}: GPUBuffer must have the INDIRECT usage flag set.`);
    }

    console.warn(
      `${operation}: Using raw GPUBuffer. Offset validation is limited. Wrap the GPUBuffer with \`root.createBuffer(...)\` for safe validation.`,
    );
    const offset = typeof start === 'number' ? start : (start?.offset ?? 0);
    validateIndirectBufferSize(indirectBuffer.size, offset, requiredSize, operation);
    return offset;
  }

  let offsetInfo = start ?? memoryLayoutOf(indirectBuffer.dataType);

  if (typeof offsetInfo === 'number') {
    if (offsetInfo === 0) {
      offsetInfo = memoryLayoutOf(indirectBuffer.dataType);
    } else {
      console.warn(
        `${operation}: Provided start offset ${offsetInfo} as a raw number. Use d.memoryLayoutOf(...) to include contiguous padding info for safer validation.`,
      );
      offsetInfo = {
        offset: offsetInfo,
        contiguous: requiredSize,
      };
    }
  }

  const { offset, contiguous } = offsetInfo;

  validateIndirectBufferSize(sizeOf(indirectBuffer.dataType), offset, requiredSize, operation);

  if (contiguous < requiredSize) {
    console.warn(
      `${operation}: Starting at offset ${offset}, only ${contiguous} contiguous bytes are available before padding. '${operation}' requires ${requiredSize} bytes (${IndirectOperationToRequiredData[operation]}). Reading across padding may result in undefined behavior.`,
    );
  }

  return offset;
}
