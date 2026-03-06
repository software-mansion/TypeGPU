import tgpu, { d } from 'typegpu';
import { perlin3d } from '@typegpu/noise';
import { CHUNK_SIZE } from './params.ts';
import { coordToIndex, indexToCoord } from './jsHelpers.ts';
import { blockTypes } from './blockTypes.ts';
import { VoxelInstance, type Chunk } from './schemas.ts';

// Chunk info is stored in an one-dimensional array,
// since one block data can fit in one number, currently it's just the block id.
export function generateChunk(chunkIndex: d.v3i): Chunk {
  const blocks = Array.from({ length: CHUNK_SIZE ** 3 }, () => 0);
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const arrayIndex = coordToIndex(d.vec3i(x, y, z));
        const result = tgpu['~unstable'].simulate(() => {
          'use gpu';
          const sampleIndex = d.vec3f(x, y, z) + d.vec3f(chunkIndex) * CHUNK_SIZE;
          return perlin3d.sample(sampleIndex * 0.2);
        }).value;
        blocks[arrayIndex] = result > 0 ? blockTypes.air : blockTypes.stone;
      }
    }
  }
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
