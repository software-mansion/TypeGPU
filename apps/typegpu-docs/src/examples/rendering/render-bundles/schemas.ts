import tgpu, { d } from 'typegpu';
import { Camera } from '../../common/setup-orbit-camera.ts';

export { Camera };

export const Vertex = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
});

export const Cube = d.struct({
  model: d.mat4x4f,
});

export const TerrainParams = d.struct({
  terrainHeight: d.f32,
  noiseScale: d.f32,
});

export const vertexLayout = tgpu.vertexLayout(d.arrayOf(Vertex));

export const cameraLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
});

export const cubeLayout = tgpu.bindGroupLayout({
  cubes: { storage: d.arrayOf(Cube), access: 'readonly' },
});

export const terrainLayout = tgpu.bindGroupLayout({
  terrain: { uniform: TerrainParams },
});
