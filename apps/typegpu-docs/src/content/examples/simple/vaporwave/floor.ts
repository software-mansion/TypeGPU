import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import * as c from "./constans";

// these will be placed in slot
export const grid = tgpu.fn(
  [d.vec2f, d.f32, d.f32],
  d.vec3f,
)((uv, speed, time) => {
  const uv_mod = std.fract(
    std.div(d.vec2f(uv.x, uv.y + speed * time), c.GRID_SEP),
  );

  // x^4 + y^4 = 0.5^4
  const diff_4 = std.pow(std.sub(d.vec2f(0.5, 0.5), uv_mod), d.vec2f(4, 4));
  const sdf = std.pow(diff_4.x + diff_4.y, 0.25) - 0.5; // - radius

  return std.mix(
    c.gridInnerColor,
    c.gridColor,
    std.exp(c.GRID_TIGHTNESS * sdf), // fading color
  );
});

export const circles = tgpu.fn(
  [d.vec2f, d.f32, d.f32],
  d.vec3f,
)((uv, speed, time) => {
  const rotMatY = d.mat4x4f.rotationY((-time * speed) / 10); // 10 is empirical
  const uv_rotated = std.mul(
    rotMatY,
    std.add(d.vec4f(uv.x, 1.0, uv.y, 1), d.vec4f(0, 0, -c.ballCenter.z, 0)),
  );

  const uv_mod = std.fract(
    std.div(d.vec2f(uv_rotated.x, uv_rotated.z), c.GRID_SEP),
  );

  const diff_2 = std.pow(std.sub(d.vec2f(0.5, 0.5), uv_mod), d.vec2f(2, 2));
  const dist = std.pow(diff_2.x + diff_2.y, 0.5);

  return std.mix(
    c.gridInnerColor,
    c.gridColor,
    std.exp(d.f32(-5) * dist), // fading color
  );
});
