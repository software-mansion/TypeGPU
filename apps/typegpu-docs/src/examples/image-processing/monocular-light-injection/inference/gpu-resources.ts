import { d } from 'typegpu';
import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import type { DepthSectionId, DepthWeightSection } from './types.ts';

export type PackedWeightBuffer = TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag;

export interface ImmutableWeightStorage {
  readonly buffers: ReadonlyMap<DepthSectionId, PackedWeightBuffer>;
  /** Weight tensors uploaded as I4/O4 rather than the bundle's O4/I4 */
  readonly transposedWeights: ReadonlySet<string>;
}

/** One weight tensor to upload with its lane pair transposed */
export interface WeightTranspose {
  readonly tensorId: string;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly elementBytes: number;
}

const TRANSPOSE_GROUP = 16;

export function transposeLanePairs(
  target: ArrayBuffer,
  transpose: WeightTranspose,
  payloadByteLength: number,
): void {
  const { tensorId, byteOffset, byteLength, elementBytes } = transpose;
  if (elementBytes !== 2 && elementBytes !== 4) {
    throw new Error(`Weight '${tensorId}' has unsupported element width ${elementBytes}.`);
  }
  if (
    !Number.isSafeInteger(byteOffset) ||
    byteOffset < 0 ||
    byteOffset % elementBytes !== 0 ||
    byteOffset + byteLength > payloadByteLength
  ) {
    throw new Error(`Weight '${tensorId}' transpose range lies outside the bundle payload.`);
  }
  const elementCount = byteLength / elementBytes;
  if (!Number.isSafeInteger(elementCount) || elementCount % TRANSPOSE_GROUP !== 0) {
    throw new Error(
      `Weight '${tensorId}' holds ${byteLength} bytes, which is not a whole number of 4x4 lane tiles.`,
    );
  }
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

/** Uploads the immutable bundle body through mapped-at-creation memory */
export function createImmutableWeightStorage(
  root: TgpuRoot,
  sections: readonly DepthWeightSection[],
  transposes: readonly WeightTranspose[] = [],
): ImmutableWeightStorage {
  const transposesBySection = new Map<DepthSectionId, WeightTranspose[]>();
  for (const transpose of transposes) {
    const section = sections.find(
      (candidate) =>
        transpose.byteOffset >= candidate.byteOffset &&
        transpose.byteOffset + transpose.byteLength <= candidate.byteOffset + candidate.byteLength,
    );
    if (!section) {
      throw new Error(`Weight '${transpose.tensorId}' is not contained by a weight section.`);
    }
    const sectionTransposes = transposesBySection.get(section.id) ?? [];
    sectionTransposes.push({
      ...transpose,
      byteOffset: transpose.byteOffset - section.byteOffset,
    });
    transposesBySection.set(section.id, sectionTransposes);
  }

  const buffers = new Map<DepthSectionId, PackedWeightBuffer>();
  try {
    for (const section of sections) {
      const buffer = root
        .createBuffer(
          d.arrayOf(d.u32, section.byteLength / Uint32Array.BYTES_PER_ELEMENT),
          (mapped) => {
            new Uint8Array(mapped.arrayBuffer).set(section.bytes);
            for (const transpose of transposesBySection.get(section.id) ?? []) {
              transposeLanePairs(mapped.arrayBuffer, transpose, section.byteLength);
            }
          },
        )
        .$usage('storage');
      buffers.set(section.id, buffer);
    }
  } catch (error) {
    for (const buffer of buffers.values()) {
      buffer.destroy();
    }
    throw error;
  }

  return {
    buffers,
    transposedWeights: new Set(transposes.map((transpose) => transpose.tensorId)),
  };
}

export function destroyImmutableWeightStorage(storage: ImmutableWeightStorage): void {
  for (const buffer of storage.buffers.values()) {
    buffer.destroy();
  }
}
