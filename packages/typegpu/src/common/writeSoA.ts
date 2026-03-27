import { computeSoAByteLength, scatterSoA } from '../data/soaIO.ts';
import { sizeOf } from '../data/sizeOf.ts';
import type { BaseData, SoAInputFor, WgslArray, WgslStruct } from '../data/wgslTypes.ts';
import type { BufferWriteOptions, TgpuBuffer } from '../core/buffer/buffer.ts';

export function writeSoA<TProps extends Record<string, BaseData>>(
  buffer: TgpuBuffer<WgslArray<WgslStruct<TProps>>>,
  data: SoAInputFor<TProps>,
  options?: BufferWriteOptions,
): void {
  const arrayBuffer = buffer.arrayBuffer;
  const startOffset = options?.startOffset ?? 0;
  const bufferSize = sizeOf(buffer.dataType);
  const naturalSize = computeSoAByteLength(
    buffer.dataType,
    data as Record<string, ArrayBufferView>,
  );
  const endOffset =
    options?.endOffset ??
    (naturalSize === undefined ? bufferSize : Math.min(startOffset + naturalSize, bufferSize));

  scatterSoA(
    new Uint8Array(arrayBuffer),
    buffer.dataType,
    data as Record<string, ArrayBufferView>,
    startOffset,
    endOffset,
  );
  buffer.write(arrayBuffer, { startOffset, endOffset });
}
