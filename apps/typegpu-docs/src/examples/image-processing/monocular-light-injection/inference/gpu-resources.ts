import { d } from 'typegpu';
import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import type { DepthSectionId, DepthWeightSection } from './types.ts';

export type PackedWeightBuffer = TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag;

export interface ImmutableWeightStorage {
  readonly buffers: ReadonlyMap<DepthSectionId, PackedWeightBuffer>;
}

export interface WeightTranspose {
  readonly tensorId: string;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly elementBytes: number;
}

const TRANSPOSE_GROUP = 16;

function transposeLanePairs(target: ArrayBuffer, transpose: WeightTranspose): void {
  const { byteOffset, byteLength, elementBytes } = transpose;
  const elementCount = byteLength / elementBytes;
  const lanes =
    elementBytes === 2
      ? new Uint16Array(target, byteOffset, elementCount)
      : new Uint32Array(target, byteOffset, elementCount);
  for (let base = 0; base < elementCount; base += TRANSPOSE_GROUP) {
    for (let row = 0; row < 4; row += 1) {
      for (let column = row + 1; column < 4; column += 1) {
        const low = base + row * 4 + column;
        const high = base + column * 4 + row;
        const swap = lanes[low];
        lanes[low] = lanes[high];
        lanes[high] = swap;
      }
    }
  }
}

export function createImmutableWeightStorage(
  root: TgpuRoot,
  sections: readonly DepthWeightSection[],
  transposes: readonly WeightTranspose[] = [],
): ImmutableWeightStorage {
  const buffers = new Map<DepthSectionId, PackedWeightBuffer>();
  for (const section of sections) {
    const sectionTransposes = transposes
      .filter(
        (transpose) =>
          transpose.byteOffset >= section.byteOffset &&
          transpose.byteOffset + transpose.byteLength <= section.byteOffset + section.byteLength,
      )
      .map((transpose) => ({
        ...transpose,
        byteOffset: transpose.byteOffset - section.byteOffset,
      }));
    const buffer = root
      .createBuffer(
        d.arrayOf(d.u32, section.byteLength / Uint32Array.BYTES_PER_ELEMENT),
        (mapped) => {
          new Uint8Array(mapped.arrayBuffer).set(section.bytes);
          for (const transpose of sectionTransposes) {
            transposeLanePairs(mapped.arrayBuffer, transpose);
          }
        },
      )
      .$usage('storage');
    buffers.set(section.id, buffer);
  }
  return { buffers };
}

export function destroyImmutableWeightStorage(storage: ImmutableWeightStorage): void {
  for (const buffer of storage.buffers.values()) {
    buffer.destroy();
  }
}
