import { d, std, tgpu } from 'typegpu';

export const linear = tgpu.fn(
  [d.vec3f, d.vec3f, d.vec3f, d.vec3f],
  d.vec3f,
)((a, b, c, weights) => {
  'use gpu';
  return std.normalize(a * weights.x + b * weights.y + c * weights.z);
});

const warp = tgpu.fn(
  [d.f32, d.f32],
  d.f32,
)((cosAngle, t) => {
  'use gpu';
  const cosHalf = std.sqrt(0.5 * (1 + cosAngle));
  const b = (2 - 2 * cosHalf) / (2 + cosHalf);
  const u = 2 * t - 1;
  return (u * (1 - b) * 0.5) / (1 - b * u * u) + 0.5;
});

export const uniformArea = tgpu.fn(
  [d.vec3f, d.vec3f, d.vec3f, d.vec3f],
  d.vec3f,
)((a, b, c, weights) => {
  'use gpu';
  const w = d.vec3f(
    warp(std.dot(b, c), weights.x),
    warp(std.dot(a, c), weights.y),
    warp(std.dot(a, b), weights.z),
  );
  return std.normalize(a * w.x + b * w.y + c * w.z);
});

export const arc = tgpu.fn(
  [d.vec3f, d.vec3f, d.f32],
  d.vec3f,
)((a, b, t) => {
  'use gpu';
  return std.normalize(std.mix(a, b, warp(std.dot(a, b), t)));
});
