import { d, std } from 'typegpu';

export function linear(a: d.v3f, b: d.v3f, c: d.v3f, weights: d.v3f) {
  'use gpu';
  return std.normalize(a * weights.x + b * weights.y + c * weights.z);
}

function warp(cosAngle: number, t: number) {
  'use gpu';
  const cosHalf = std.sqrt(0.5 * (1 + cosAngle));
  const b = (2 - 2 * cosHalf) / (2 + cosHalf);
  const u = 2 * t - 1;
  return (u * (1 - b) * 0.5) / (1 - b * u * u) + 0.5;
}

export function uniformArea(a: d.v3f, b: d.v3f, c: d.v3f, weights: d.v3f) {
  'use gpu';
  const w = d.vec3f(
    warp(std.dot(b, c), weights.x),
    warp(std.dot(a, c), weights.y),
    warp(std.dot(a, b), weights.z),
  );
  return std.normalize(a * w.x + b * w.y + c * w.z);
}

export function arc(a: d.v3f, b: d.v3f, t: number) {
  'use gpu';
  return std.normalize(std.mix(a, b, warp(std.dot(a, b), t)));
}
