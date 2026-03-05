import tgpu, { d } from 'typegpu';
import { perlin2d, perlin3d } from '@typegpu/noise';
import { CHUNK_SIZE } from './params.ts';
import { coordToIndex } from './jsHelpers.ts';

export function generate(chunkIndex: d.v3i): number[] {
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
        blocks[arrayIndex] = result;
      }
    }
  }
  return blocks;
}
