import tgpu, { d } from 'typegpu';
import { perlin3d } from '@typegpu/noise';
import { CHUNK_SIZE, CHUNK_SIZE_BITS } from './params.ts';
import { blockTypes } from './blockTypes.ts';
import { VoxelInstance, type Chunk } from './schemas.ts';

export const coordToIndex = tgpu.fn([d.vec3i], d.i32)`(coord) => {
  return (coord.z << (CHUNK_SIZE_BITS * 2)) |
      (coord.y << CHUNK_SIZE_BITS) |
      coord.x;
  }`.$uses({ CHUNK_SIZE_BITS });

const indexToCoord = (index: number) => {
  return d.vec3i(
    (index >> (CHUNK_SIZE_BITS * 2)) & (CHUNK_SIZE - 1),
    (index >> CHUNK_SIZE_BITS) & (CHUNK_SIZE - 1),
    index & (CHUNK_SIZE - 1),
  );
};

const root = await tgpu.init();

// Chunk info is stored in an one-dimensional array,
// since one block data can fit in one number, currently it's just the block id.
export async function generateChunk(chunkIndex: d.v3i): Promise<Chunk> {
  const blocksBuffer = root.createMutable(d.arrayOf(d.u32, CHUNK_SIZE ** 3));
  const blockTypesFromPerlinPipeline = root.createGuardedComputePipeline((x, y, z) => {
    'use gpu';
    const arrayIndex = coordToIndex(d.vec3i(x, y, z));
    const sampleIndex = d.vec3f(x, y, z) + d.vec3f(chunkIndex) * CHUNK_SIZE;
    const result = perlin3d.sample(sampleIndex * 0.2) ** 3 + chunkIndex.y / 64;
    if (result > 0) {
      blocksBuffer.$[arrayIndex] = blockTypes.air;
    } else {
      blocksBuffer.$[arrayIndex] = blockTypes.stone;
    }
  });
  blockTypesFromPerlinPipeline.dispatchThreads(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE);

  const blocks = await blocksBuffer.read();
  return { chunkIndex, blocks };
}

export function chunkToInstanceData(chunk: Chunk): d.Infer<typeof VoxelInstance>[] {
  const instanceData: d.Infer<typeof VoxelInstance>[] = [];
  for (let i = 0; i < chunk.blocks.length; i++) {
    if (chunk.blocks[i] !== blockTypes.air) {
      instanceData.push(
        VoxelInstance({
          blockPos: chunk.chunkIndex.mul(CHUNK_SIZE).add(indexToCoord(i)),
          blockType: chunk.blocks[i],
        }),
      );
    }
  }
  return instanceData;
}
