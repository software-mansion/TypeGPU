import { d } from 'typegpu';
export const Ray = d.struct({
  origin: d.vec4f,
  direction: d.vec4f,
});

export const Light = d.struct({
  position: d.vec3f,
  color: d.vec3f,
});

export const Material = d.struct({
  albedo: d.vec3f,
  metallic: d.f32,
  roughness: d.f32,
  ao: d.f32,
});

export const BloomParams = d.struct({
  threshold: d.f32,
  intensity: d.f32,
});
