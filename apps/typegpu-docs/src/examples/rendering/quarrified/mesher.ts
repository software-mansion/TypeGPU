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

export const MAX_CHUNKS_AT_ONCE = Object.values(INIT_CONFIG.chunks)
  .map((v) => v[1] - v[0] + 1)
  .reduce((a, b) => a * b, 1);

// TODO: rewrite this AI slop
function calculateMeshForChunk(chunk: Chunk): d.v4f[] {
  const vertices: d.v4f[] = [];
  const { chunkIndex, blocks } = chunk;

  const coordToIndexCPU = (x: number, y: number, z: number) =>
    (z << (CHUNK_SIZE_BITS * 2)) | (y << CHUNK_SIZE_BITS) | x;

  const isAir = (x: number, y: number, z: number): boolean => {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
      return true;
    }
    return blocks[coordToIndexCPU(x, y, z)] === 0;
  };

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
            vertices.push(d.vec4f(p.x + wx, p.y + wy, p.z + wz, 1));
          }
        };

        if (isAir(x, y - 1, z)) addFace(faces.bottom);
        if (isAir(x, y + 1, z)) addFace(faces.top);
        if (isAir(x - 1, y, z)) addFace(faces.left);
        if (isAir(x + 1, y, z)) addFace(faces.right);
        if (isAir(x, y, z + 1)) addFace(faces.front);
        if (isAir(x, y, z - 1)) addFace(faces.back);
      }
    }
  }

  return vertices;
}

export class Mesher {
  #root: TgpuRoot;
  freeIds: Set<number>;
  chunkToId: Map<Chunk, number>;
  vertexBuffer: TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag & VertexFlag;
  indirectBuffer: TgpuBuffer<d.WgslArray<d.Vec4u>> & IndirectFlag;
  totalVertices: number;

  constructor(root: TgpuRoot) {
    this.#root = root;
    this.freeIds = new Set(Array.from({ length: MAX_CHUNKS_AT_ONCE }, (_, i) => i));
    this.chunkToId = new Map();
    this.vertexBuffer = this.#root
      .createBuffer(d.arrayOf(d.vec4f, (256 * 1024 * 1024) / 4 / 4))
      .$usage('vertex', 'storage');
    this.indirectBuffer = this.#root
      .createBuffer(d.arrayOf(d.vec4u, MAX_CHUNKS_AT_ONCE))
      .$usage('indirect');
    this.totalVertices = 0;
  }

  // TODO: support chunk rerendering
  recalculateMeshesFor(chunks: Chunk[]) {
    const vertexData: d.v4f[] = [];
    for (let id = 0; id < chunks.length; id++) {
      const chunk = chunks[id];
      const vertices = calculateMeshForChunk(chunk);
      this.indirectBuffer.writePartial([
        { idx: id, value: d.vec4u(vertices.length * 16, 1, vertexData.length * 16, 0) },
      ]);
      vertexData.push(...vertices);
    }
    // TODO: use float32Array and unwrap
    this.vertexBuffer.write(vertexData);
    this.totalVertices = vertexData.length;
  }

  getResources() {
    return {
      vertexBuffer: this.vertexBuffer,
      indirectBuffer: this.indirectBuffer,
      vertexCount: this.totalVertices,
    };
  }
}

type SlotId = number;

class FreeList {
  /**
   * Creates a free list.
   * At any point, all margins and offsets are rounded up to 4 * 3.
   * Throws if an allocation fails.
   */
  constructor(size: number, marginPercent: number) {}

  /**
   * Creates a slot of size `size*(1+marginPercent)`, and sets it current size to `size`.
   */
  allocate(size: number): { id: SlotId; offset: number } {}

  /**
   * Deallocates a slot
   */
  deallocate(id: SlotId) {}

  /**
   * Returns whether the bloch needs to be moved (deallocated and reallocated).
   */
  check(id: SlotId, newSize: number): boolean {}

  /**
   * Returns all relevant info for given slot
   */
  slotInfoFor(id: SlotId): { offset: number; size: number; margin: number } {}

  /**
   * Stats for debugging, computed lazily.
   */
  getStats(): {
    totalFreeSpace: number;
    largestFreeBlock: number; // If this is much smaller than totalFreeSpace, you are heavily fragmented
    fragmentationRatio: number;
  } {}
}
