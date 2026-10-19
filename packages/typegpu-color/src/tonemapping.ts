import { tgpu } from 'typegpu';
import { f32, vec3f } from 'typegpu/data';
import { max, min, mix, select, saturate } from 'typegpu/std';

export const exposureAccess = tgpu.accessor(f32, 1);

export const aces = tgpu.fn(
  [vec3f],
  vec3f,
)((rgb) => {
  'use gpu';

  const exposedColor = rgb * exposureAccess.$;

  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;

  return saturate((exposedColor * (a * exposedColor + b)) / (exposedColor * (c * exposedColor + d) + e));
});

const hableCurve = tgpu.fn(
  [vec3f],
  vec3f,
)((x) => {
  'use gpu';

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
  vec3f,
)((rgb) => {
  'use gpu';

  const W = vec3f(11.2);
  const exposedColor = rgb * exposureAccess.$;

  return saturate(hableCurve(exposedColor) / hableCurve(W));
});

export const reinhard = tgpu.fn(
  [vec3f],
  vec3f,
)((rgb) => {
  'use gpu';

  const exposedColor = rgb * exposureAccess.$;

  return saturate(exposedColor / (1 + exposedColor));
});

export const neutral = tgpu.fn(
  [vec3f],
  vec3f,
)((rgb) => {
  'use gpu';

  const exposedColor = rgb * exposureAccess.$;

  const startCompression = 0.8 - 0.04;
  const desaturation = 0.15;

  const x = min(exposedColor.r, exposedColor.g, exposedColor.b);
  const offset = select(0.04, x - 6.25 * x * x, x < 0.08);

  let color = exposedColor - offset;

  const peak = max(color.r, color.g, color.b);

  if (peak < startCompression) {
    return saturate(color);
  }
  
  const d = 1 - startCompression;
  const newPeak = 1 - (d * d) / (peak - startCompression + d);
  color *= newPeak / peak;

  const g = 1 - 1 / (desaturation * (peak - newPeak) + 1);

  return saturate(mix(color, vec3f(newPeak), g));
});
