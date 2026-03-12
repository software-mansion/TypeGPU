import tgpu, { d } from 'typegpu';

export type Chunk = { chunkIndex: d.v3i; blocks: number[] };

export const Camera = d.struct({ view: d.mat4x4f, projection: d.mat4x4f });

// First 3 elements are the position of the block
// The last element is a combination of all block metadata:
// - least important 8 bits - block type
// - next 8 bits - sprite side index
// - next 8 bits - block metadata (block type specific)
// - next 4 bits - sky light level (without semi-transparent blocks, this is always either 0 or 15)
// - last 4 bits - block sky level
export const MeshLayout = tgpu.vertexLayout(d.arrayOf(d.vec4i), 'instance');
