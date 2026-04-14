import { d, type StorageFlag, type TgpuBuffer, type TgpuRoot, type VertexFlag } from 'typegpu';
import { CHUNK_SIZE, INIT_CONFIG } from './params.ts';
import type { Chunk } from './schemas.ts';
import { coordToIndex } from './chunkGenerator.ts';
import type { WorldMap } from './worldMap.ts';
import { blockTypes } from './blockTypes.ts';

export const MAX_CHUNKS_AT_ONCE = Object.values(INIT_CONFIG.chunks)
  .map((v) => v[1] - v[0] + 1)
  .reduce((a, b) => a * b, 1);

// TODO: implement defragmentation (recreating the buffer and FreeList? or maybe just recreating the entire Mesher?)
export class Mesher {
  #root: TgpuRoot;
  #vertexBuffer: TgpuBuffer<d.WgslArray<d.Vec4i>> & StorageFlag & VertexFlag;
  #workArray: Int32Array<ArrayBuffer>;
  #emptyArray: Int32Array<ArrayBuffer>;

  #freeList: FreeList;
  #chunkToId: Map<Chunk, SlotId>;

  constructor(root: TgpuRoot, vertexBufferSize = /* 256MB */ 256 * 1024 * 1024) {
    this.#root = root;
    this.#freeList = new FreeList(vertexBufferSize, 0.05);
    this.#chunkToId = new Map();
    this.#vertexBuffer = this.#root
      .createBuffer(d.arrayOf(d.vec4i, vertexBufferSize / 16))
      .$usage('vertex', 'storage');
    this.#workArray = new Int32Array(CHUNK_SIZE ** 3 * 4 * 4 * 4);
    this.#emptyArray = new Int32Array(CHUNK_SIZE ** 3 * 4 * 4 * 4);
  }

  /**
   * Checks which meshes need updating and (re)calculates them.
   */
  updateMeshes(worldMap: WorldMap) {
    const dirtyChunks = worldMap.getAndCleanModifiedChunks();
    if (dirtyChunks.length === 0) {
      return;
    }

    // --- This is here only to measure performance and will be removed ---
    const time = performance.now();
    // --- End ---

    const unwrappedBuffer = this.#root.unwrap(this.#vertexBuffer);

    for (const chunk of dirtyChunks) {
      const vertexCount = calculateMeshForChunk(worldMap, chunk, this.#workArray);
      const byteSize = vertexCount * 4 * 4;

      let slotId = this.#chunkToId.get(chunk);
      if (slotId === undefined) {
        slotId = this.#freeList.allocate(byteSize);
        this.#chunkToId.set(chunk, slotId);
      }

      if (this.#freeList.check(slotId, byteSize)) {
        console.log('Reallocating chunk', ...chunk.chunkIndex, 'size', byteSize);

        const oldInfo = this.#freeList.slotInfoFor(slotId);
        this.#freeList.deallocate(slotId);
        this.#freeList.allocate(byteSize, slotId);
        const newInfo = this.#freeList.slotInfoFor(slotId);
        if (oldInfo.offset !== newInfo.offset) {
          // only clear the old slot if the chunk actually changed places
          this.#root.device.queue.writeBuffer(
            unwrappedBuffer,
            oldInfo.offset,
            this.#emptyArray,
            0,
            oldInfo.capacity / 4,
          );
        }
      }

      const offset = this.#freeList.slotInfoFor(slotId).offset;

      // TODO: pass the block type info so we can draw appropriate textures
      this.#root.device.queue.writeBuffer(
        unwrappedBuffer,
        offset,
        this.#workArray,
        0,
        vertexCount * 4,
      );
    }

    // --- This is here only to measure performance and will be removed ---
    const total = performance.now() - time;
    console.log(
      `Meshing ${dirtyChunks.length} chunks took ${total.toFixed(0)}ms, agv: ${(total / dirtyChunks.length).toFixed(2)}ms`,
    );
    // --- End ---
  }

  getResources() {
    return {
      vertexBuffer: this.#vertexBuffer,
      // / 4 (to i32s) / 4 (to vec4is) = instance count
      instanceCount: this.#freeList.getFurthestAllocated() / 4 / 4,
    };
  }
}

/**
 * Calculates a mesh for the chunk, stores it in the provided arrayBuffer, and returns the number of instances (faces).
 * This function should only be called on chunks that have their neighborhood generated.
 */
function calculateMeshForChunk(worldMap: WorldMap, chunk: Chunk, arrayBuffer: Int32Array): number {
  let instanceCount = 0;
  const { chunkIndex: ci, blocks } = chunk;

  // Pre-fetched neighboring chunks to avoid map lookups
  // !! this makes everything WAY FASTER, 1.05ms -> 0.06ms !!
  const negX = worldMap.getChunk(d.vec3i(ci.x - 1, ci.y, ci.z)) as Chunk;
  const posX = worldMap.getChunk(d.vec3i(ci.x + 1, ci.y, ci.z)) as Chunk;
  const negY = worldMap.getChunk(d.vec3i(ci.x, ci.y - 1, ci.z)) as Chunk;
  const posY = worldMap.getChunk(d.vec3i(ci.x, ci.y + 1, ci.z)) as Chunk;
  const negZ = worldMap.getChunk(d.vec3i(ci.x, ci.y, ci.z - 1)) as Chunk;
  const posZ = worldMap.getChunk(d.vec3i(ci.x, ci.y, ci.z + 1)) as Chunk;

  const wx0 = ci.x * CHUNK_SIZE;
  const wy0 = ci.y * CHUNK_SIZE;
  const wz0 = ci.z * CHUNK_SIZE;

  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const blockData = blocks[coordToIndex(x, y, z)];
        if (blockData.blockType === blockTypes.air) continue;

        const wx = wx0 + x;
        const wy = wy0 + y;
        const wz = wz0 + z;

        // JS is actually smart about dynamically created functions, this is fine
        function checkAddFace(
          neighborChunk: Chunk,
          nx: number,
          ny: number,
          nz: number,
          index: number,
        ) {
          const neighborBlock = neighborChunk.blocks[coordToIndex(nx, ny, nz)];
          if (neighborBlock.blockType !== blockTypes.air) {
            return;
          }
          arrayBuffer[4 * instanceCount] = wx;
          arrayBuffer[4 * instanceCount + 1] = wy;
          arrayBuffer[4 * instanceCount + 2] = wz;
          arrayBuffer[4 * instanceCount + 3] =
            blockTypes.stone | (index << 8) | (neighborBlock.lightLevel << 24);
          instanceCount += 1;
        }

        const L = CHUNK_SIZE - 1; // L for limit

        checkAddFace(y === 0 ? negY : chunk, x, y === 0 ? L : y - 1, z, 0);
        checkAddFace(y === L ? posY : chunk, x, y === L ? 0 : y + 1, z, 1);
        checkAddFace(x === 0 ? negX : chunk, x === 0 ? L : x - 1, y, z, 2);
        checkAddFace(x === L ? posX : chunk, x === L ? 0 : x + 1, y, z, 3);
        checkAddFace(z === L ? posZ : chunk, x, y, z === L ? 0 : z + 1, 4);
        checkAddFace(z === 0 ? negZ : chunk, x, y, z === 0 ? L : z - 1, 5);
      }
    }
  }

  return instanceCount;
}

type SlotId = number;

function roundUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

class FreeList {
  ALIGNMENT = 4 * 4 * 4; // 4 bytes * 4 elements * 4 vectors
  #marginPercent: number;
  #slots: Map<SlotId, { offset: number; capacity: number }>;
  #freeBlocks: { offset: number; size: number }[];
  #nextId: number;
  #furthestAllocated: number;

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
    this.#furthestAllocated = 0;
  }

  /**
   * Creates a slot of size `size*(1+marginPercent)`, and sets it current size to `size`.
   * To keep the same `slotId`, one can deallocate it and then allocate while passing `slotId` as the second argument.
   * TODO: This can be optimized by using an ordered map from size to offset
   */
  allocate(size: number, slotId?: number): SlotId {
    const capacity = roundUp(size * (1 + this.#marginPercent), this.ALIGNMENT);
    let id: number;
    if (slotId !== undefined) {
      if (this.#slots.has(slotId)) {
        throw new Error(
          `FreeList: cannot allocate slotId ${slotId} twice, call 'deallocate' first.`,
        );
      }
      id = slotId;
    } else {
      id = this.#nextId++;
    }

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
        this.#slots.set(id, { offset, capacity });
        this.#furthestAllocated = Math.max(this.#furthestAllocated, offset + capacity);
        return id;
      }
    }

    throw new Error(`FreeList: allocation of ${capacity} bytes failed — out of space`);
  }

  /**
   * Returns the number of bits from 0 to the last one ever touched.
   */
  getFurthestAllocated(): number {
    return this.#furthestAllocated;
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
