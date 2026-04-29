import tgpu, { d } from 'typegpu';
import { Camera } from '../../common/setup-orbit-camera.ts';

export const LIGHT_COUNT = 3;

export const Vertex = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
  albedo: d.vec3f,
  roughness: d.f32,
  metallic: d.f32,
  wetness: d.f32,
});

export const RectLight = d.struct({
  center: d.vec3f,
  dirX: d.vec3f,
  dirY: d.vec3f,
  halfSize: d.vec2f,
  color: d.vec3f,
  intensity: d.f32,
});

export const Lights = d.arrayOf(RectLight, LIGHT_COUNT);

export const RenderParams = d.struct({
  exposure: d.f32,
  environmentIntensity: d.f32,
  diffuseIblStrength: d.f32,
  specularIblStrength: d.f32,
  wetness: d.f32,
  time: d.f32,
});

export const vertexLayout = tgpu.vertexLayout(d.arrayOf(Vertex));

export const sceneLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  lights: { uniform: Lights },
  params: { uniform: RenderParams },
});

export const ltcLayout = tgpu.bindGroupLayout({
  ltcMat: { texture: d.texture2d(d.f32), sampleType: 'unfilterable-float' },
  ltcAmp: { texture: d.texture2d(d.f32), sampleType: 'unfilterable-float' },
});

export const environmentLayout = tgpu.bindGroupLayout({
  environmentMap: { texture: d.textureCube(d.f32) },
  environmentSampler: { sampler: 'filtering' },
});
