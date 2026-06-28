import tgpu from "typegpu";
import { vec3f } from "typegpu/data";
import { max, min, mix, select, saturate } from "typegpu/std";

export const aces = tgpu.fn(
  [vec3f],
  vec3f
)((rgb) => {
  "use gpu";

  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;

  return saturate((rgb * (a * rgb + b)) / (rgb * (c * rgb + d) + e));
});

const hableCurve = tgpu.fn(
  [vec3f],
  vec3f
)((x) => {
  "use gpu";

  const a = 0.15;
  const b = 0.5;
  const c = 0.1;
  const d = 0.2;
  const e = 0.02;
  const f = 0.3;

  return (x * (a * x + c * b) + d * e) / (x * (a * x + b) + d * f) - e / f;
});

export const hable = tgpu.fn(
  [vec3f],
  vec3f
)((rgb) => {
  "use gpu";

  const W = vec3f(11.2);

  return saturate(hableCurve(rgb) / hableCurve(W));
});

export const reinhard = tgpu.fn(
  [vec3f],
  vec3f
)((rgb) => {
  "use gpu";
  
  return saturate(rgb / (vec3f(1.0) + rgb));
});

export const neutral = tgpu.fn(
  [vec3f],
  vec3f
)((rgb) => {
  "use gpu";

  const startCompression = 0.8 - 0.04;
  const desaturation = 0.15;

  const x = min(rgb.r, min(rgb.g, rgb.b));
  const offset = select(0.04, x - 6.25 * x * x, x < 0.08);

  let color = rgb - offset;

  const peak = max(color.r, max(color.g, color.b));

  if (peak < startCompression) {
    return saturate(color);
  }

  const d = 1.0 - startCompression;
  const newPeak = 1.0 - (d * d) / (peak - startCompression + d);
  color *= newPeak / peak;

  const g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);

  return saturate(mix(color, vec3f(newPeak), g));
});