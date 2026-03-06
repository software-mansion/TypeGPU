import { d } from 'typegpu';
import type { Config } from './state.ts';

export const INIT_CONFIG: Config = {
  playerPos: d.vec3f(8, 8, -100),
  chunks: {
    xRange: d.vec2i(-1, 1),
    yRange: d.vec2i(-1, 1),
    zRange: d.vec2i(-1, 1),
  },
};

export const CHUNK_SIZE_BITS = 4;
export const CHUNK_SIZE = 1 << CHUNK_SIZE_BITS;
