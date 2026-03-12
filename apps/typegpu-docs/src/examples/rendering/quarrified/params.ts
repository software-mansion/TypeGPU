import { d } from 'typegpu';
import type { Config } from './state.ts';

export const INIT_CONFIG: Config = {
  playerPos: d.vec3f(0, 18, 0),
  playerDims: d.vec2f(0.5, 0.45), // capsule
  chunks: {
    xRange: d.vec2i(0, 12),
    yRange: d.vec2i(0, 3),
    zRange: d.vec2i(0, 12),
  },
};

export const CHUNK_SIZE_BITS = 4;
export const CHUNK_SIZE = 1 << CHUNK_SIZE_BITS;
