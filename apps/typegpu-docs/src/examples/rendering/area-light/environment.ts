import { perlin3d } from '@typegpu/noise';
import tgpu, { d, std } from 'typegpu';

export const ENVIRONMENT_SIZE = 256;
const ENVIRONMENT_EDGE_SCALE = ENVIRONMENT_SIZE / (ENVIRONMENT_SIZE - 1);

export const environmentGenerationLayout = tgpu.bindGroupLayout({
  face: { uniform: d.u32 },
});

function cubeFaceDirection(face: number, uv: d.v2f) {
  'use gpu';
  let direction = d.vec3f(1, -uv.y, -uv.x);

  if (face === d.u32(1)) {
    direction = d.vec3f(-1, -uv.y, uv.x);
  } else if (face === d.u32(2)) {
    direction = d.vec3f(uv.x, 1, uv.y);
  } else if (face === d.u32(3)) {
    direction = d.vec3f(uv.x, -1, -uv.y);
  } else if (face === d.u32(4)) {
    direction = d.vec3f(uv.x, -uv.y, 1);
  } else if (face === d.u32(5)) {
    direction = d.vec3f(-uv.x, -uv.y, -1);
  }

  return std.normalize(direction);
}

function noise01(p: d.v3f) {
  'use gpu';
  return perlin3d.sample(p) * 0.5 + 0.5;
}

function fbm(p: d.v3f) {
  'use gpu';
  return (
    noise01(p) * 0.5 +
    noise01(p * 2.05 + d.vec3f(7.4, -3.1, 2.6)) * 0.32 +
    noise01(p * 4.1 + d.vec3f(-4.8, 6.2, 9.1)) * 0.18
  );
}

const GLOWS = [
  { dir: d.vec3f(-0.36, 0.46, 0.82), tint: d.vec3f(0.76, 0.24, 0.46), power: 9, strength: 0.22 },
  { dir: d.vec3f(-0.68, 0.04, 0.73), tint: d.vec3f(1, 0.08, 0.58), power: 24, strength: 0.55 },
  { dir: d.vec3f(-0.2, -0.02, 0.98), tint: d.vec3f(1, 0.42, 0.08), power: 28, strength: 0.34 },
  { dir: d.vec3f(0.74, 0.03, -0.54), tint: d.vec3f(0.5, 0.2, 1), power: 34, strength: 0.22 },
];

function glow(direction: d.v3f, source: d.v3f, color: d.v3f, power: number, strength: number) {
  'use gpu';
  return color * std.max(std.dot(direction, std.normalize(source)), 0) ** d.f32(power) * strength;
}

function cloudDensity(direction: d.v3f) {
  'use gpu';
  const p = direction * 1.28 + d.vec3f(2.1, -1.4, 4.7);
  const warp = d.vec3f(fbm(p + 8.3), fbm(p - 5.6), fbm(p + d.vec3f(-2.2, 4.1, 7.5))) - 0.5;
  const body = std.smoothstep(0.26, 0.76, fbm(p + warp * 0.9));
  const wisps = std.smoothstep(0.44, 0.86, fbm(p * 2.35 + warp * 0.65 + 6.2));
  const verticalEase = 0.78 + (1 - std.abs(direction.y)) * 0.22;

  return std.clamp((body * 0.78 + wisps * 0.22) * verticalEase, 0, 1);
}

function environmentColor(direction: d.v3f) {
  'use gpu';
  const vertical = direction.y * 0.5 + 0.5;
  const shell = std.mix(d.vec3f(0.018, 0.01, 0.024), d.vec3f(0.041, 0.023, 0.045), vertical);
  const clouds = cloudDensity(direction);
  const cloudTint = std.mix(d.vec3f(0.12, 0.055, 0.11), d.vec3f(0.68, 0.34, 0.52), clouds);
  let color = std.mix(shell, cloudTint, clouds * 0.58);

  const horizonHaze = 1 - std.smoothstep(0.02, 0.36, std.abs(direction.y + 0.03));
  color += d.vec3f(0.16, 0.045, 0.085) * horizonHaze * 0.16;

  for (const g of tgpu.unroll(GLOWS)) {
    color += glow(direction, g.dir, g.tint, g.power, g.strength);
  }

  return std.clamp(color, d.vec3f(0), d.vec3f(1));
}

export const environmentFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const ndc = uv * d.vec2f(2, -2) + d.vec2f(-1, 1);
  const direction = cubeFaceDirection(
    environmentGenerationLayout.$.face,
    ndc * ENVIRONMENT_EDGE_SCALE,
  );
  return d.vec4f(environmentColor(direction), 1);
});
