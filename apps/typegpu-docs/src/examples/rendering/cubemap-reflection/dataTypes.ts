import { d } from 'typegpu';

export const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
  position: d.vec4f,
});

export const Vertex = d.unstruct({
  position: d.float16x4,
  normal: d.float16x4,
});

export const ComputeVertex = d.struct({
  position: d.vec2u, // four packed 16-bit floats
  normal: d.vec2u, // four packed 16-bit floats
});

export const CubeVertex = d.struct({
  position: d.vec3f,
  uv: d.vec2f,
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
