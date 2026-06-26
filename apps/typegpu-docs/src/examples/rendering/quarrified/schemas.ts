import tgpu, { d } from 'typegpu';

export interface Config {
  playerPos: d.v3f;
  playerDims: d.v2f;
  chunks: {
    xRange: d.v2i;
    yRange: d.v2i;
    zRange: d.v2i;
  };
  skyAbove: number;
}

export type Block = { blockType: number; lightLevel: number };
export type Chunk = { chunkIndex: d.v3i; blocks: Block[] };

export const Camera = d.struct({ view: d.mat4x4f, projection: d.mat4x4f });

export const PlayerModel = d.struct({ model: d.mat4x4f });

// First 3 elements are the position of the block
// The last element is a combination of all block metadata:
// - least important 8 bits - block type
// - next 8 bits - sprite side index
// - next 8 bits - block metadata (block type specific)
// - next 4 bits - light level
export const MeshLayout = tgpu.vertexLayout(d.arrayOf(d.vec4i), 'instance');
