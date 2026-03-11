import {
  d,
  type IndirectFlag,
  type StorageFlag,
  type TgpuBuffer,
  type TgpuRoot,
  type VertexFlag,
} from 'typegpu';
import { CHUNK_SIZE, CHUNK_SIZE_BITS, INIT_CONFIG } from './params.ts';
import { faces } from './cubeVertices.ts';
import type { Chunk } from './schemas.ts';
import { coordToIndexCPU } from './chunkGenerator.ts';

export const MAX_CHUNKS_AT_ONCE = Object.values(INIT_CONFIG.chunks)
  .map((v) => v[1] - v[0] + 1)
  .reduce((a, b) => a * b, 1);

const isAir = (chunk: Chunk, x: number, y: number, z: number): boolean => {
  if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
    return true;
  }
  return chunk.blocks[coordToIndexCPU(x, y, z)] === 0;
};

// TODO: rewrite this AI slop
function calculateMeshForChunk(chunk: Chunk, arrayBuffer: Float32Array): number {
  let verticesCount = 0;
  const { chunkIndex, blocks } = chunk;

  const wx0 = chunkIndex.x * CHUNK_SIZE;
  const wy0 = chunkIndex.y * CHUNK_SIZE;
  const wz0 = chunkIndex.z * CHUNK_SIZE;

  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        if (blocks[coordToIndexCPU(x, y, z)] === 0) continue;

        const wx = wx0 + x;
        const wy = wy0 + y;
        const wz = wz0 + z;

        const addFace = (faceVertices: (typeof faces)[keyof typeof faces]) => {
          for (const v of faceVertices) {
            const p = v.position;
            arrayBuffer[4 * verticesCount] = p.x + wx;
            arrayBuffer[4 * verticesCount + 1] = p.y + wy;
            arrayBuffer[4 * verticesCount + 2] = p.z + wz;
            arrayBuffer[4 * verticesCount + 3] = 1;
            verticesCount += 1;
          }
        };

        if (isAir(chunk, x, y - 1, z)) addFace(faces.bottom);
        if (isAir(chunk, x, y + 1, z)) addFace(faces.top);
        if (isAir(chunk, x - 1, y, z)) addFace(faces.left);
        if (isAir(chunk, x + 1, y, z)) addFace(faces.right);
        if (isAir(chunk, x, y, z + 1)) addFace(faces.front);
        if (isAir(chunk, x, y, z - 1)) addFace(faces.back);
      }
    }
  }

  return verticesCount;
}

// TODO: implement defragmentation (recreating the buffer and FreeList?)
export class Mesher {
  #root: TgpuRoot;
  vertexBuffer: TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag & VertexFlag;
  // TODO: remove this
  indirectBuffer: TgpuBuffer<d.WgslArray<d.Vec4u>> & IndirectFlag;
  totalVertices: number;
  arrayBuffer: Float32Array<ArrayBuffer>;

  freeList: FreeList;
  chunkToId: Map<Chunk, SlotId>;

  constructor(root: TgpuRoot) {
    this.#root = root;
    const size = 256 * 1024 * 1024 - 16; // 256MB rounded down to a multiple of 48
    this.freeList = new FreeList(size, 0.05);
    this.chunkToId = new Map();
    this.vertexBuffer = this.#root
      .createBuffer(d.arrayOf(d.vec4f, size / 16))
      .$usage('vertex', 'storage');
    this.indirectBuffer = this.#root
      .createBuffer(d.arrayOf(d.vec4u, MAX_CHUNKS_AT_ONCE))
      .$usage('indirect');
    this.totalVertices = 0;
    this.arrayBuffer = new Float32Array(CHUNK_SIZE ** 3 * 3 * 4 * 4);
  }

  recalculateMeshesFor(chunks: Chunk[]) {
    const unwrappedBuffer = this.#root.unwrap(this.vertexBuffer);

    for (const chunk of chunks) {
      const newSize = calculateMeshForChunk(chunk, this.arrayBuffer) * 4 * 4;

      let slotId = this.chunkToId.get(chunk);
      if (slotId === undefined) {
        slotId = this.freeList.allocate(newSize);
        this.chunkToId.set(chunk, slotId);
      }

      if (this.freeList.check(slotId, newSize)) {
        // We need to:
        // - clear the old vertex buffer slot
        // - deallocate the slot from freeList
        // - reallocate it
        // - update the slotId map
        // TODO: maybe we can keep the slotId of a chunk?
        console.log('REALLOCATING', ...chunk.chunkIndex, 'SIZE', newSize);

        const info = this.freeList.slotInfoFor(slotId);
        this.#root.device.queue.writeBuffer(
          unwrappedBuffer,
          info.offset,
          this.arrayBuffer,
          0,
          newSize / 4,
        );

        this.freeList.deallocate(slotId);

        slotId = this.freeList.allocate(newSize);

        this.chunkToId.set(chunk, slotId);
      }

      const offset = this.freeList.slotInfoFor(slotId).offset;

      // TODO: pass the block type info so we can draw appropriate textures
      this.#root.device.queue.writeBuffer(
        unwrappedBuffer,
        offset,
        this.arrayBuffer,
        0,
        newSize / 4,
      );
      this.totalVertices += newSize / 4;
    }
  }

  getResources() {
    return {
      vertexBuffer: this.vertexBuffer,
      indirectBuffer: this.indirectBuffer,
      // TODO: return the number of the last non-zero vertex
      vertexCount: (256 * 1024 * 1024 - 16) / 16,
    };
  }
}

type SlotId = number;

function roundUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

class FreeList {
  ALIGNMENT = 4 * 4 * 3; // 4 bytes * 4 elements * 3 vectors
  #marginPercent: number;
  #slots: Map<SlotId, { offset: number; capacity: number }>;
  #freeBlocks: { offset: number; size: number }[];
  #nextId: number;

  /**
   * Creates a free list.
   * At any point, all margins and offsets are rounded up to 4 * 3.
   * Throws if an allocation fails.
   */
  constructor(size: number, marginPercent: number) {
    this.#marginPercent = marginPercent;
    this.#slots = new Map();
    this.#nextId = 0;
    const alignedSize = roundUp(size, this.ALIGNMENT);
    this.#freeBlocks = [{ offset: 0, size: alignedSize }];
  }

  /**
   * Creates a slot of size `size*(1+marginPercent)`, and sets it current size to `size`.
   * TODO: This can be optimized by using an ordered map from size to offset
   */
  allocate(size: number): SlotId {
    const capacity = roundUp(size * (1 + this.#marginPercent), this.ALIGNMENT);

    for (let i = 0; i < this.#freeBlocks.length; i++) {
      const block = this.#freeBlocks[i];
      if (block.size >= capacity) {
        const offset = block.offset;
        const remainder = block.size - capacity;
        if (remainder > 0) {
          this.#freeBlocks[i] = { offset: offset + capacity, size: remainder };
        } else {
          this.#freeBlocks.splice(i, 1);
        }
        const id = this.#nextId++;
        this.#slots.set(id, { offset, capacity });
        return id;
      }
    }

    throw new Error(`FreeList: allocation of ${capacity} bytes failed — out of space`);
  }

  /**
   * Deallocates a slot.
   * TODO: Currently this is O(n^2), we will need to optimize this when we start dynamically rendering chunks
   */
  deallocate(id: SlotId) {
    const slot = this.#slots.get(id);
    if (!slot) {
      throw new Error(`FreeList: unknown slot id ${id}`);
    }
    this.#slots.delete(id);

    this.#freeBlocks.push({ offset: slot.offset, size: slot.capacity });
    this.#freeBlocks.sort((a, b) => a.offset - b.offset);

    // Coalesce adjacent free blocks
    for (let i = this.#freeBlocks.length - 1; i > 0; i--) {
      const prev = this.#freeBlocks[i - 1];
      const curr = this.#freeBlocks[i];
      if (prev.offset + prev.size === curr.offset) {
        prev.size += curr.size;
        this.#freeBlocks.splice(i, 1);
      }
    }
  }

  /**
   * Returns whether the block needs to be moved (deallocated and reallocated).
   */
  check(id: SlotId, newSize: number): boolean {
    const slot = this.#slots.get(id);
    if (!slot) {
      throw new Error(`FreeList: unknown slot id ${id}`);
    }
    return newSize > slot.capacity;
  }

  /**
   * Returns relevant info for given slot.
   */
  slotInfoFor(id: SlotId): { offset: number; capacity: number } {
    const slot = this.#slots.get(id);
    if (!slot) {
      throw new Error(`FreeList: unknown slot id ${id}`);
    }
    return slot;
  }

  /**
   * Stats for debugging, computed on demand (slow).
   */
  getStats(): { totalFreeSpace: number; largestFreeBlock: number } {
    let totalFreeSpace = 0;
    let largestFreeBlock = 0;
    for (const block of this.#freeBlocks) {
      totalFreeSpace += block.size;
      if (block.size > largestFreeBlock) {
        largestFreeBlock = block.size;
      }
    }
    return { totalFreeSpace, largestFreeBlock };
  }
}
