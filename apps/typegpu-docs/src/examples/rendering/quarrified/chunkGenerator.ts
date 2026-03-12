import tgpu, {
  d,
  std,
  type TgpuGuardedComputePipeline,
  type TgpuMutable,
  type TgpuRoot,
  type TgpuUniform,
} from 'typegpu';
import { perlin3d } from '@typegpu/noise';
import { CHUNK_SIZE, CHUNK_SIZE_BITS } from './params.ts';
import { blockTypes } from './blockTypes.ts';
import { type Chunk } from './schemas.ts';

export const coordToIndex = tgpu.fn([d.vec3i], d.i32)`(coord) => {
  return (coord.z << (CHUNK_SIZE_BITS * 2)) |
      (coord.y << CHUNK_SIZE_BITS) |
      coord.x;
  }`.$uses({ CHUNK_SIZE_BITS });

export const coordToIndexCPU = (x: number, y: number, z: number) =>
  (z << (CHUNK_SIZE_BITS * 2)) | (y << CHUNK_SIZE_BITS) | x;

// Chunk info is stored in an one-dimensional array. Each block's info fits in one u32
export class ChunkGenerator {
  #pipeline: TgpuGuardedComputePipeline<[x: number, y: number, z: number]>;
  private blocksMutable: TgpuMutable<d.WgslArray<d.U32>>;
  private chunkIndexUniform: TgpuUniform<d.Vec3i>;
  constructor(root: TgpuRoot) {
    this.blocksMutable = root.createMutable(d.arrayOf(d.u32, CHUNK_SIZE ** 3));
    this.chunkIndexUniform = root.createUniform(d.vec3i);
    this.#pipeline = root.createGuardedComputePipeline((x, y, z) => {
      'use gpu';
      const arrayIndex = coordToIndex(d.vec3i(x, y, z));
      const sampleIndex = d.vec3f(x, y, z) + d.vec3f(this.chunkIndexUniform.$) * CHUNK_SIZE;
      const result = perlin3d.sample(sampleIndex * 0.2) ** 3;
      if (d.f32(result) > -0.02) {
        this.blocksMutable.$[arrayIndex] =
          blockTypes.air + std.min(0, 16 + this.chunkIndexUniform.$.y) * 2 ** 24;
      } else {
        this.blocksMutable.$[arrayIndex] =
          blockTypes.stone + std.min(0, 16 + this.chunkIndexUniform.$.y) * 2 ** 24;
      }
    });
  }

  async generateChunk(chunkIndex: d.v3i): Promise<Chunk> {
    this.chunkIndexUniform.write(chunkIndex);
    this.#pipeline.dispatchThreads(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE);

    const blocks = await this.blocksMutable.read();
    return { chunkIndex, blocks };
  }
}
