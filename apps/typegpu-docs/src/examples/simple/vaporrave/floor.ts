import tgpu, { d, std } from 'typegpu';

import * as c from './constants.ts';

export const grid = tgpu.fn([d.vec2f, d.f32], d.vec3f)((uv, time) => {
  // time is really an angle, but we are fine as long as it keeps increasing
  const uvNormalized = std.fract(
    d.vec2f(uv.x, uv.y + time).div(c.GRID_SEP),
  );

  // x^4 + y^4 = 0.5^4
  const diff4 = std.pow(
    d.vec2f(0.5, 0.5).sub(uvNormalized),
    d.vec2f(4, 4),
  );
  const sdf = std.pow(diff4.x + diff4.y, 0.25) - 0.5; // -radius

  return std.mix(
    c.gridInnerColor,
    c.gridColor,
    std.exp(c.GRID_TIGHTNESS * sdf), // fading color
  );
});

/**
 * Returns a transformation matrix that represents an `angle` rotation
 * in the XY plane (around the imaginary Z axis)
 */
const rotateXY = tgpu.fn([d.f32], d.mat2x2f)((angle) =>
  d.mat2x2f(
    /* right */ d.vec2f(std.cos(angle), std.sin(angle)),
    /* up    */ d.vec2f(-std.sin(angle), std.cos(angle)),
  )
);

export const circles = tgpu.fn([d.vec2f, d.f32], d.vec3f)((uv, angle) => {
  const uvRotated = rotateXY(angle).mul(d.vec2f(uv.x, uv.y - c.sphereCenter.z));

  const uvNormalized = std.fract(
    d.vec2f(uvRotated.x, uvRotated.y).div(c.GRID_SEP),
  );

  // working with circle centered at (0.5, 0.5)
  const diff2 = std.pow(d.vec2f(0.5, 0.5).sub(uvNormalized), d.vec2f(2));
  const distO = std.pow(diff2.x + diff2.y, 0.5);

  return std.mix(
    c.gridInnerColor,
    c.gridColor,
    std.exp(-c.CIRCLE_FLOOR_MASS * distO), // fading color
  );
});
