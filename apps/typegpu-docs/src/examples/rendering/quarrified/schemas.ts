import { d } from 'typegpu';

export const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
});
