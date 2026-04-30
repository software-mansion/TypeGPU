import { perlin3d } from '@typegpu/noise';
import tgpu, { d, std } from 'typegpu';

export const ENVIRONMENT_SIZE = 256;
export const ENVIRONMENT_MIP_LEVELS = Math.floor(Math.log2(ENVIRONMENT_SIZE)) + 1;

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

function cloudMap(direction: d.v3f) {
  'use gpu';
  const p = direction * 1.35 + d.vec3f(2.1, -1.4, 4.7);
  const warp = d.vec3f(fbm(p + 8.3), fbm(p - 5.6), fbm(p + d.vec3f(-2.2, 4.1, 7.5))) - 0.5;
  const cover = fbm(p + warp * 0.85);
  const lowerSky = std.smoothstep(-0.18, 0.45, direction.y);
  const fadeToZenith = 1 - std.smoothstep(0.52, 0.92, direction.y);

  return std.smoothstep(0.3, 0.7, cover) * lowerSky * fadeToZenith;
}

function environmentColor(direction: d.v3f) {
  'use gpu';
  const skyBlend = std.smoothstep(-0.28, 0.85, direction.y);
  const groundBlend = std.smoothstep(-1, 0.08, direction.y);
  const night = std.mix(d.vec3f(0.006, 0.005, 0.008), d.vec3f(0.033, 0.018, 0.034), skyBlend);
  const ground = std.mix(d.vec3f(0.004, 0.004, 0.005), d.vec3f(0.024, 0.014, 0.019), groundBlend);
  let color = std.mix(ground, night, std.smoothstep(-0.12, 0.12, direction.y));

  const clouds = cloudMap(direction);
  const cloudTint = std.mix(d.vec3f(0.2, 0.1, 0.17), d.vec3f(0.72, 0.38, 0.54), clouds);
  color = std.mix(color, cloudTint, clouds * 0.56);

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
  const direction = cubeFaceDirection(environmentGenerationLayout.$.face, uv);
  return d.vec4f(environmentColor(direction), 1);
});
