import * as d from 'typegpu/data';

export const Vertex = d.struct({
  position: d.vec4f,
  color: d.vec4f,
});

export const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

export const Transform = d.struct({
  model: d.mat4x4f,
});
