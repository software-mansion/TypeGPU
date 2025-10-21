import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  CLOUD_CORE_DENSITY,
  CLOUD_DENSITY,
  CLOUD_DETALIZATION,
  DARK,
  FAR,
  FLIGHT_SPEED,
  LIGHT_ABSORPTION,
  MAX_ITERATIONS,
  sampledViewSlot,
  samplerSlot,
  SKY,
  SUN,
  SUN_INTENSITY,
  timeAccess,
  WHITE,
} from './consts.ts';

export const raymarch = tgpu.fn(
  [d.vec3f, d.vec3f, d.vec3f],
  d.vec4f,
)((ro, rd, sunDirection) => {
  let res = d.vec4f();

  const hash = std.fract(
    std.sin(std.dot(rd.xy, d.vec2f(12.9898, 78.233))) * 43758.5453,
  );
  const MARCH_SIZE = 1 / MAX_ITERATIONS;
  let depth = hash * MARCH_SIZE;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const p = std.add(ro, std.mul(rd, depth * FAR));
    const rawDensity = fractalBrownianMotion(p) - 1.5 + CLOUD_DENSITY * 2;
    const density = std.clamp(rawDensity, 0.0, 1.0);

    if (density > 0.0) {
      // light occlusion along sun direction
      let diffuse = std.clamp(
        rawDensity - fractalBrownianMotion(std.add(p, sunDirection)) - 1.5 +
          CLOUD_DENSITY * 2,
        0.0,
        1.0,
      );
      // contrast boost
      diffuse = std.mix(0.3, 1.0, diffuse);

      const lighting = std.add(
        std.mul(SKY, 1.1),
        std.mul(SUN, diffuse * SUN_INTENSITY),
      );

      const albedo = std.mix(WHITE, DARK, density);

      const lit = albedo.mul(lighting);
      const premul = d.vec4f(lit, 1).mul(density);
      res = res.add(premul.mul(LIGHT_ABSORPTION - res.w));

      if (res.w >= LIGHT_ABSORPTION - 1e-3) {
        break;
      }
    }
    depth += MARCH_SIZE;
  }
  return res;
});

const fractalBrownianMotion = tgpu.fn(
  [d.vec3f],
  d.f32,
)((p) => {
  // simple wind/movement
  let q = std.add(
    p,
    d.vec3f(
      std.sin(timeAccess.$),
      std.cos(timeAccess.$),
      timeAccess.$ * FLIGHT_SPEED,
    ),
  );
  let sum = d.f32();
  let amplitude = d.f32(CLOUD_CORE_DENSITY);
  let frequency = d.f32(CLOUD_DETALIZATION);

  for (let i = 0; i < 4; i++) {
    sum += noise(q) * amplitude;
    q = std.mul(q, frequency);
    amplitude *= 0.4;
    frequency += 0.5;
  }
  return sum;
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
