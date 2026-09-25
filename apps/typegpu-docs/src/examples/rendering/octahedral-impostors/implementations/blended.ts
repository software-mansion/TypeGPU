import { d, std } from 'typegpu';
import { viewsPerAxis, octEncode, ViewSelection } from '../impostor.ts';

export const blendedViews = (direction: d.v3f) => {
  'use gpu';
  const grid = octEncode(direction) * (viewsPerAxis - 1);
  const cell = std.min(std.floor(grid), d.vec2f(viewsPerAxis - 2));
  const fraction = grid - cell;
  const lowerTriangle = fraction.x + fraction.y < 1;
  const corner = std.select(d.vec2f(1), d.vec2f(0), lowerTriangle);
  const weights = std.select(
    d.vec3f(fraction.x + fraction.y - 1, 1 - fraction.y, 1 - fraction.x),
    d.vec3f(1 - fraction.x - fraction.y, fraction.x, fraction.y),
    lowerTriangle,
  );
  return ViewSelection({
    frames: d.arrayOf(d.vec2f, 3)([cell + corner, cell + d.vec2f(1, 0), cell + d.vec2f(0, 1)]),
    weights,
  });
};
