import { perlin3d } from '@typegpu/noise';
import tgpu, { d, std } from 'typegpu';

export const ENVIRONMENT_SIZE = 256;
const ENVIRONMENT_EDGE_SCALE = ENVIRONMENT_SIZE / (ENVIRONMENT_SIZE - 1);

export const environmentGenerationLayout = tgpu.bindGroupLayout({
  face: { uniform: d.u32 },
});

const cubeFaceDirection = tgpu.fn(
  [d.u32, d.vec2f],
  d.vec3f,
)((face, uv) => {
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
});

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

function glow(direction: d.v3f, source: d.v3f, color: d.v3f, power: number, strength: number) {
  'use gpu';
  return color * std.max(std.dot(direction, std.normalize(source)), 0) ** power * strength;
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
  color += glow(direction, d.vec3f(-0.36, 0.46, 0.82), d.vec3f(0.76, 0.24, 0.46), d.f32(9), 0.22);
  color += glow(direction, d.vec3f(-0.68, 0.04, 0.73), d.vec3f(1, 0.08, 0.58), d.f32(24), 0.55);
  color += glow(direction, d.vec3f(-0.2, -0.02, 0.98), d.vec3f(1, 0.42, 0.08), d.f32(28), 0.34);
  color += glow(direction, d.vec3f(0.74, 0.03, -0.54), d.vec3f(0.5, 0.2, 1), d.f32(34), 0.22);

  return std.clamp(color, d.vec3f(0), d.vec3f(1));
}

export const environmentVertex = tgpu.vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})(({ vertexIndex }) => {
  'use gpu';
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
  return {
    pos: d.vec4f(pos[vertexIndex], 0, 1),
    uv: pos[vertexIndex],
  };
});

export const environmentFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const direction = cubeFaceDirection(
    environmentGenerationLayout.$.face,
    uv * ENVIRONMENT_EDGE_SCALE,
  );
  return d.vec4f(environmentColor(direction), 1);
});
