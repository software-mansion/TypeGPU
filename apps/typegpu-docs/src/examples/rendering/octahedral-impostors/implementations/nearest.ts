import { d, std } from 'typegpu';
import { viewsPerAxis, octEncode, ViewSelection } from '../impostor.ts';

export const nearestView = (direction: d.v3f) => {
  'use gpu';
  const frame = std.round(octEncode(direction) * (viewsPerAxis - 1));
  return ViewSelection({
    frames: d.arrayOf(d.vec2f, 3)([frame, frame, frame]),
    weights: d.vec3f(1, 0, 0),
  });
};
