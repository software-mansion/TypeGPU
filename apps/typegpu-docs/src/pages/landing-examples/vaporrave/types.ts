import { d } from 'typegpu';

export const Ray = d.struct({
  color: d.vec3f,
  dist: d.f32,
});

export const LightRay = d.struct({
  ray: Ray,
  glow: d.vec3f,
});
