import { d, type TgpuRoot } from 'typegpu';
import type { Chunk } from './schemas.ts';
import { ChunkGenerator, coordToIndex } from './chunkGenerator.ts';

const offsets = [
  d.vec3i(-1, 0, 0),
  d.vec3i(1, 0, 0),
  d.vec3i(0, -1, 0),
  d.vec3i(0, 1, 0),
  d.vec3i(0, 0, -1),
  d.vec3i(0, 0, 1),
];

export class WorldMap {
  #chunkGenerator: ChunkGenerator;
  // TODO: make it private
  chunks: Map<string, Chunk> = new Map();
  // Keeps the number of neighboring chunks that are already generated (from 0 to 6)
  #neighbors: Map<Chunk, number> = new Map();
  // Holds chunks that need rerendering. Those are:
  // - new chunks that already have all of their neighbors generated,
  // - old chunks that were modified.
  #dirtyChunks: Set<Chunk> = new Set();

  constructor(
    root: TgpuRoot,
    public readonly xRange: d.v2i,
    public readonly yRange: d.v2i,
    public readonly zRange: d.v2i,
  ) {
    this.#chunkGenerator = new ChunkGenerator(root);
  }

  async initChunks() {
    for (let x = this.xRange[0]; x <= this.xRange[1]; x++) {
      for (let y = this.yRange[0]; y <= this.yRange[1]; y++) {
        for (let z = this.zRange[0]; z <= this.zRange[1]; z++) {
          // oxlint-disable-next-line typescript-eslint(no-floating-promises)
          this.generateChunk(d.vec3i(x, y, z));
        }
      }
    }
  }

  async generateChunk(chunkPos: d.v3i) {
    if (this.getChunk(chunkPos)) {
      throw new Error('WorldMap: Cannot generate an already existing chunk');
    }
    const chunk = await this.#chunkGenerator.generateChunk(chunkPos);
    this.chunks.set(chunkPos.toString(), chunk);

    for (const neighbour of offsets.map((offset) => this.getChunk(chunkPos.add(offset)))) {
      if (neighbour) {
        for (const updatedChunk of [chunk, neighbour]) {
          let chunkNeighbors = this.#neighbors.get(updatedChunk) ?? 0;
          this.#neighbors.set(updatedChunk, ++chunkNeighbors);
          if (chunkNeighbors >= 6) {
            this.#dirtyChunks.add(updatedChunk);
          }
        }
      }
    }
  }

  getChunk(chunkPos: d.v3i): Chunk | undefined {
    return this.chunks.get(chunkPos.toString());
  }

  updateBlock(chunkPos: d.v3i, blockPos: d.v3i, newBlock: number) {
    const chunk = this.chunks.get(chunkPos.toString());
    if (!chunk) {
      throw new Error(`World: Tried to modify chunk that has not been generated (${chunkPos}).`);
    }
    this.#dirtyChunks.add(chunk);
    chunk.blocks[coordToIndex(blockPos.x, blockPos.y, blockPos.z)].blockType = newBlock;
  }

  getAndCleanModifiedChunks(): Chunk[] {
    const chunks = [...this.#dirtyChunks];
    this.#dirtyChunks.clear();
    return chunks;
  }
}
