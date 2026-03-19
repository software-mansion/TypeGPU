import tgpu from 'typegpu';
import { f32, vec3f } from 'typegpu/data';
import { floor, max, min } from 'typegpu/std';

export const hsvToRgb = tgpu.fn(
  [vec3f],
  vec3f,
)((hsv) => {
  const h = hsv.x;
  const s = hsv.y;
  const v = hsv.z;

  const i = floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r = f32(0);
  let g = f32(0);
  let b = f32(0);
  if (i % 6 === 0) {
    r = v;
    g = t;
    b = p;
  } else if (i % 6 === 1) {
    r = q;
    g = v;
    b = p;
  } else if (i % 6 === 2) {
    r = p;
    g = v;
    b = t;
  } else if (i % 6 === 3) {
    r = p;
    g = q;
    b = v;
  } else if (i % 6 === 4) {
    r = t;
    g = p;
    b = v;
  } else {
    r = v;
    g = p;
    b = q;
  }
  return vec3f(r, g, b);
});

export const rgbToHsv = tgpu.fn(
  [vec3f],
  vec3f,
)((rgb) => {
  const r = rgb.x;
  const g = rgb.y;
  const b = rgb.z;

  const maxC = max(r, max(g, b));
  const minC = min(r, min(g, b));
  const delta = f32(maxC - minC);
  let h = f32(0);
  let s = f32(0);
  if (maxC === 0) {
    s = 0;
  } else {
    s = delta / maxC;
  }
  const v = maxC;

  if (maxC === minC) {
    h = 0;
  } else if (maxC === r) {
    let cond = f32(0);
    if (g < b) {
      cond = 6;
    } else {
      cond = 0;
    }
    h = g - b + delta * cond;
    h /= 6 * delta;
  } else if (maxC === g) {
    h = b - r + delta * 2;
    h /= 6 * delta;
  } else if (maxC === b) {
    h = r - g + delta * 4;
    h /= 6 * delta;
  }

  return vec3f(h, s, v);
});
