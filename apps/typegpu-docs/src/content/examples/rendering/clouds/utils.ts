import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { perlin3d } from '@typegpu/noise';
import {
  CLOUD_CORE_DENSITY,
  CLOUD_DENSITY,
  CLOUD_DETALIZATION,
  FLIGHT_SPEED,
  LIGHT_ABSORBTION,
  MARCH_SIZE,
  MAX_ITERATIONS,
  SUN_INTENSITY,
  timeAccess,
} from './consts.ts';

export const raymarch = tgpu.fn(
  [d.vec3f, d.vec3f, d.vec3f],
  d.vec4f,
)((ro, rd, sunDirection) => {
  let res = d.vec4f();

  const hash = std.fract(
    std.sin(std.dot(rd.xy, d.vec2f(12.9898, 78.233))) * 43758.5453,
  );
  let depth = hash * MARCH_SIZE;

  const white = d.vec3f(1.0, 1.0, 1.0);
  const dark = d.vec3f(0.2, 0.2, 0.2);
  const skyAmbient = d.vec3f(0.6, 0.45, 0.75);
  const sunTint = d.vec3f(1.0, 0.7, 0.3);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const p = std.add(ro, std.mul(rd, depth));
    const rawDensity = scene(p);
    const density = std.clamp(rawDensity, 0.0, 1.0);

    if (density > 0.0) {
      // light occlusion along sun direction
      let diffuse = std.clamp(
        rawDensity - scene(std.add(p, sunDirection)),
        0.0,
        1.0,
      );
      // contrast boost
      diffuse = std.mix(0.3, 1.0, diffuse);

      const lighting = std.add(
        std.mul(skyAmbient, 1.1),
        std.mul(sunTint, diffuse * SUN_INTENSITY),
      );

      const albedo = std.mix(white, dark, density);

      const lit = d.vec3f(
        albedo.x * lighting.x,
        albedo.y * lighting.y,
        albedo.z * lighting.z,
      );
      const premul = d.vec4f(
        lit.x * density,
        lit.y * density,
        lit.z * density,
        density,
      );

      res = std.add(res, std.mul(premul, LIGHT_ABSORBTION - res.w));

      if (res.w >= LIGHT_ABSORBTION - 1e-3) {
        break;
      }
    }
    depth += MARCH_SIZE;
  }
  return res;
});

const scene = tgpu.fn(
  [d.vec3f],
  d.f32,
)((p) => {
  return fractalBrownianMotion(p) - 1.5 + CLOUD_DENSITY * 2;
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
  let sum = d.f32(0.0);
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

const noise = tgpu.fn([d.vec3f], d.f32)((x) => perlin3d.sample(x));
