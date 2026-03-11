import tgpu, { d } from 'typegpu';

export type Chunk = { chunkIndex: d.v3i; blocks: number[] };

export const Camera = d.struct({ view: d.mat4x4f, projection: d.mat4x4f });

export const MeshLayout = tgpu.vertexLayout(d.arrayOf(d.vec4f), 'instance');
