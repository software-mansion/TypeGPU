import { d } from 'typegpu';
import type { Config } from './state.ts';

export const INIT_CONFIG: Config = {
  playerPos: d.vec3f(-8, 8, -8),
  chunks: {
    xRange: d.vec2i(0, 12),
    yRange: d.vec2i(0, 3),
    zRange: d.vec2i(0, 12),
    // xRange: d.vec2i(0, 1),
    // yRange: d.vec2i(0, 1),
    // zRange: d.vec2i(0, 1),
  },
};

export const CHUNK_SIZE_BITS = 4;
export const CHUNK_SIZE = 1 << CHUNK_SIZE_BITS;
