import tgpu, { d } from 'typegpu';

export type Chunk = { chunkIndex: d.v3i; blocks: number[] };

export const Camera = d.struct({ view: d.mat4x4f, projection: d.mat4x4f });

export const CubeVertex = d.unstruct({ position: d.vec4f, uv: d.vec2f });
export const VertexCubeLayout = tgpu.vertexLayout(d.disarrayOf(CubeVertex), 'vertex');

export const BlockInstance = d.unstruct({ blockPos: d.vec3i, blockType: d.u32 });
export const InstanceLayout = tgpu.vertexLayout(d.disarrayOf(BlockInstance), 'instance');
