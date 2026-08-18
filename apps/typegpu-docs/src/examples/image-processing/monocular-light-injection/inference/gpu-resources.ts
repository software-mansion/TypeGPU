import { d } from 'typegpu';
import type { StorageFlag, TgpuBindGroupLayout, TgpuBuffer, TgpuRoot } from 'typegpu';
import type { PreparedRawBindGroup } from './execution-plan.ts';

export type PackedWeightBuffer = TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag;

export interface ImmutableWeightStorage {
  readonly buffer: PackedWeightBuffer;
  readonly rawBuffer: GPUBuffer;
  readonly byteLength: number;
  /** Weight tensors uploaded as I4/O4 rather than the bundle's O4/I4. */
  readonly transposedWeights: ReadonlySet<string>;
}

/**
 * One weight tensor to upload with its lane pair transposed. The bundle packs a
 * convolution tile as `((tile * 4 + outputLane) * 4 + inputLane)`; a kernel that
 * accumulates by outer product needs the two lanes swapped, which is a 4x4
 * transpose within every group of sixteen scalars and needs no other shape
 * information.
 */
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

/** Uploads the immutable bundle body through mapped-at-creation memory. */
export function createImmutableWeightStorage(
  root: TgpuRoot,
  bytes: Uint8Array,
  transposes: readonly WeightTranspose[] = [],
): ImmutableWeightStorage {
  const buffer = root
    .createBuffer(d.arrayOf(d.u32, bytes.byteLength / Uint32Array.BYTES_PER_ELEMENT), (mapped) => {
      new Uint8Array(mapped.arrayBuffer).set(bytes);
      for (const transpose of transposes) {
        transposeLanePairs(mapped.arrayBuffer, transpose, bytes.byteLength);
      }
    })
    .$usage('storage')
    .$name('DepthART immutable weights');
  const rawBuffer = root.unwrap(buffer);
  return {
    buffer,
    rawBuffer,
    byteLength: bytes.byteLength,
    transposedWeights: new Set(transposes.map((transpose) => transpose.tensorId)),
  };
}

/** Binds an aligned section of the shared weight buffer. */
export function storageBindingFor(
  storage: ImmutableWeightStorage,
  offset: number,
  size: number,
): GPUBufferBinding {
  return { buffer: storage.rawBuffer, offset, size };
}

/**
 * Creates a stable raw bind group. Raw groups let each binding address an aligned
 * sub-range of the single immutable model buffer without copying weights per layer.
 */
export function createPreparedRawBindGroup(
  root: TgpuRoot,
  layout: TgpuBindGroupLayout,
  resources: Readonly<Record<string, GPUBindingResource>>,
  label: string,
): PreparedRawBindGroup {
  const entries: GPUBindGroupEntry[] = [];

  for (const [binding, [key, entry]] of Object.entries(layout.entries).entries()) {
    if (entry === null) {
      continue;
    }
    const resource = resources[key];
    if (resource === undefined) {
      throw new Error(`Missing raw bind-group resource '${key}' for ${label}.`);
    }
    entries.push({ binding, resource });
  }

  return {
    layout,
    bindGroup: root.device.createBindGroup({
      label,
      layout: root.unwrap(layout),
      entries,
    }),
  };
}
