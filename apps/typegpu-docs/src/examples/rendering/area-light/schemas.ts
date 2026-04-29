import tgpu, { d } from 'typegpu';
import { Camera } from '../../common/setup-orbit-camera.ts';

export const LIGHT_COUNT = 3;

export const Vertex = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
  albedo: d.vec3f,
  roughness: d.f32,
  metallic: d.f32,
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
  ambientSky: d.vec3f,
  ambientGround: d.vec3f,
});

export const HorizonClip = d.struct({
  l0: d.vec3f,
  l1: d.vec3f,
  l2: d.vec3f,
  l3: d.vec3f,
  l4: d.vec3f,
  count: d.u32,
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

export type ExampleVertex = d.InferInput<typeof Vertex>;
