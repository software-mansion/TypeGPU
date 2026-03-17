import { d } from 'typegpu';
import type { Config } from './state.ts';

export const CHUNK_SIZE_BITS = 4;
export const CHUNK_SIZE = 1 << CHUNK_SIZE_BITS;

export const INIT_CONFIG: Config = {
  playerPos: d.vec3f(2, 16 + 2, 2).mul(CHUNK_SIZE),
  playerDims: d.vec2f(0.35, 0.9),
  chunks: {
    xRange: d.vec2i(-1, 10),
    yRange: d.vec2i(0, 18),
    zRange: d.vec2i(-1, 10),
  },
  // all blocks above this value must be (initially) empty for the sky lighting to work
  skyAbove: CHUNK_SIZE * 16,
};
