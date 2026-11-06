import { tgpu, d, std } from 'typegpu';

export const aces = tgpu.fn(
  [d.vec3f],
  d.vec3f,
)((rgb) => {
  'use gpu';

  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const dd = 0.59;
  const e = 0.14;

  return std.saturate((rgb * (a * rgb + b)) / (rgb * (c * rgb + dd) + e));
});

const hableCurve = tgpu.fn(
  [d.vec3f],
  d.vec3f,
)((x) => {
  'use gpu';

  const a = 0.15;
  const b = 0.5;
  const c = 0.1;
  const dd = 0.2;
  const e = 0.02;
  const f = 0.3;

  return (x * (a * x + c * b) + dd * e) / (x * (a * x + b) + dd * f) - e / f;
});

export const hable = tgpu.fn(
  [d.vec3f],
  d.vec3f,
)((rgb) => {
  'use gpu';

  const W = d.vec3f(11.2);
  return std.saturate(hableCurve(rgb) / hableCurve(W));
});

export const reinhard = tgpu.fn(
  [d.vec3f],
  d.vec3f,
)((rgb) => {
  'use gpu';

  return std.saturate(rgb / (1 + rgb));
});

export const neutral = tgpu.fn(
  [d.vec3f],
  d.vec3f,
)((rgb) => {
  'use gpu';

  const startCompression = 0.8 - 0.04;
  const desaturation = 0.15;

  const x = std.min(rgb.r, rgb.g, rgb.b);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;

  let color = rgb - offset;

  const peak = std.max(color.r, color.g, color.b);

  if (peak < startCompression) {
    return std.saturate(color);
  }

  const dd = 1 - startCompression;
  const newPeak = 1 - (dd * dd) / (peak - startCompression + dd);
  color *= newPeak / peak;

  const g = 1 - 1 / (desaturation * (peak - newPeak) + 1);

  return std.saturate(std.mix(color, d.vec3f(newPeak), g));
});
