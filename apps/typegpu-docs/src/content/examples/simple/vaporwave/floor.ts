import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

import * as c from './constants.ts';

export const grid = tgpu.fn(
  [d.vec2f, d.f32],
  d.vec3f,
)((uv, time) => { // time is really an angle, but we are fine as long as it keeps increasing
  const uvNormalized = std.fract(
    std.div(d.vec2f(uv.x, uv.y + time), c.GRID_SEP),
  );

  // x^4 + y^4 = 0.5^4
  const diff4 = std.pow(
    std.sub(d.vec2f(0.5, 0.5), uvNormalized),
    d.vec2f(4, 4),
  );
  const sdf = std.pow(diff4.x + diff4.y, 0.25) - 0.5; // -radius

  return std.mix(
    c.gridInnerColor,
    c.gridColor,
    std.exp(c.GRID_TIGHTNESS * sdf), // fading color
  );
});

export const circles = tgpu.fn(
  [d.vec2f, d.f32],
  d.vec3f,
)((uv, angle) => {
  const rotMatY = d.mat4x4f.rotationY(angle); // 10 is hardcoded empirically
  const uvRotated = std.mul(
    rotMatY,
    std.add(d.vec4f(uv.x, 1.0, uv.y, 1), d.vec4f(0, 0, -c.sphereCenter.z, 0)),
  );

  const uvNormalized = std.fract(
    std.div(d.vec2f(uvRotated.x, uvRotated.z), c.GRID_SEP),
  );

  // working with circle centered at (0.5, 0.5)
  const diff2 = std.pow(std.sub(d.vec2f(0.5, 0.5), uvNormalized), d.vec2f(2));
  const distO = std.pow(diff2.x + diff2.y, 0.5);

  return std.mix(
    c.gridInnerColor,
    c.gridColor,
    std.exp(-c.CIRCLE_FLOOR_MASS * distO), // fading color
  );
});
