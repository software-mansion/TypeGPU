import tgpu, { d } from 'typegpu';

export type Chunk = { chunkIndex: d.v3i; blocks: number[] };

export const Camera = d.struct({ view: d.mat4x4f, projection: d.mat4x4f });

export const CubeVertex = d.unstruct({ position: d.vec4f, uv: d.vec2f });
export const CubeVertexLayout = tgpu.vertexLayout(d.disarrayOf(CubeVertex), 'vertex');

export const VoxelInstance = d.unstruct({ blockPos: d.vec3i, blockType: d.u32 });
export const VoxelInstanceLayout = tgpu.vertexLayout(d.disarrayOf(VoxelInstance), 'instance');

export const MeshLayout = tgpu.vertexLayout(d.arrayOf(d.vec4f), 'vertex');

export const PlayerModel = d.struct({ model: d.mat4x4f });
