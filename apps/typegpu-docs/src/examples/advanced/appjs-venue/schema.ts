import { d } from 'typegpu';

export const Camera = d.struct({
  view: d.mat4x4f,
  viewProjection: d.mat4x4f,
});
