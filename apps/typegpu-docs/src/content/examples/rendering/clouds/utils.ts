import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  CLOUD_CORE_DENSITY,
  CLOUD_DENSITY,
  CLOUD_DETALIZATION,
  FLIGHT_SPEED,
  LIGHT_ABSORBTION,
  MARCH_SIZE,
  MAX_ITERATIONS,
  sampledViewSlot,
  samplerSlot,
  SUN_INTENSITY,
  timeAccess,
} from './consts.ts';

export const raymarch = tgpu.fn(
  [d.vec3f, d.vec3f, d.vec3f],
  d.vec4f,
)((ro, rd, sunDirection) => {
  let res = d.vec4f(0.0, 0.0, 0.0, 0.0);
  const hash = std.fract(
    std.sin(std.dot(rd.xy, d.vec2f(12.9898, 78.233))) * 43758.5453,
  );
  let depth = hash * MARCH_SIZE;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const p = std.add(ro, std.mul(rd, depth));
    const density = std.clamp(scene(p), 0.0, 1.0);
    if (density > 0.0) {
      let diffuse = std.clamp(
        scene(p) - scene(std.add(p, sunDirection)),
        0.0,
        1.0,
      );
      diffuse = std.mix(0.3, 1.0, diffuse);
      const lin = std.add(
        std.mul(d.vec3f(0.6, 0.45, 0.75), 1.1),
        std.mul(d.vec3f(1.0, 0.7, 0.3), diffuse * SUN_INTENSITY),
      );
      let color = d.vec4f(
        std.mix(d.vec3f(1.0, 1.0, 1.0), d.vec3f(0.2, 0.2, 0.2), density),
        density,
      );
      color = d.vec4f(
        color.x * lin.x,
        color.y * lin.y,
        color.z * lin.z,
        color.w,
      );
      color = d.vec4f(
        color.x * color.w,
        color.y * color.w,
        color.z * color.w,
        color.w,
      );
      res = std.add(res, std.mul(color, LIGHT_ABSORBTION - res.w));
    }
    depth += MARCH_SIZE;
  }
  return res;
});

const scene = tgpu.fn(
  [d.vec3f],
  d.f32,
)((p) => {
  const f = fbm(p);
  return f - 1.5 + CLOUD_DENSITY * 2.0;
});

const fbm = tgpu.fn(
  [d.vec3f],
  d.f32,
)((p) => {
  let q = std.add(
    p,
    d.vec3f(
      std.sin(timeAccess.$),
      std.cos(timeAccess.$),
      timeAccess.$ * FLIGHT_SPEED,
    ),
  );
  let f = d.f32(0.0);
  let scale = d.f32(CLOUD_CORE_DENSITY);
  let factor = d.f32(CLOUD_DETALIZATION);

  for (let i = 0; i < 4; i++) {
    f += noise(q) * scale;
    q = std.mul(q, factor);
    scale *= 0.4;
    factor += 0.5;
  }
  return f;
});

const noise = tgpu.fn(
  [d.vec3f],
  d.f32,
)((x) => {
  const p = std.floor(x);
  let f = std.fract(x);

  f = std.mul(std.mul(f, f), std.sub(3.0, std.mul(2.0, f)));

  const uv = std.add(
    std.add(p.xy, std.mul(d.vec2f(37.0, 239.0), d.vec2f(p.z, p.z))),
    f.xy,
  );
  const tex = std.textureSampleLevel(
    sampledViewSlot.$,
    samplerSlot.$,
    std.fract(std.div(std.add(uv, d.vec2f(0.5, 0.5)), 256.0)),
    0.0,
  ).yx;

  return std.mix(tex.x, tex.y, f.z) * 2.0 - 1.0;
});
