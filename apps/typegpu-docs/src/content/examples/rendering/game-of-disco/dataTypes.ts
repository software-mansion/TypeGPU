import * as d from 'typegpu/data';

export const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
  position: d.vec4f,
});

export const Vertex = d.struct({
  position: d.vec4f,
  color: d.vec4f,
  normal: d.vec4f,
});

export const DirectionalLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
  intensity: d.f32,
});

export const Material = d.struct({
  ambient: d.vec3f,
  diffuse: d.vec3f,
  specular: d.vec3f,
  shininess: d.f32,
  reflectivity: d.f32,
});
