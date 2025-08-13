import * as d from 'typegpu/data';

export const DirectionalLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
  intensity: d.f32,
});
export type DirectionalLight = typeof DirectionalLight;

export const AmbientLight = d.struct({
  color: d.vec3f,
  intensity: d.f32,
});
export type AmbientLight = typeof AmbientLight;

export const PointLight = d.struct({
  position: d.vec3f,
  color: d.vec3f,
  intensity: d.f32,
  range: d.f32,
});
export type PointLight = typeof PointLight;
