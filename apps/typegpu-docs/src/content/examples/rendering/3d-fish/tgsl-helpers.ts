import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const hsvToRgb = tgpu['~unstable'].fn([d.vec3f], d.vec3f).does((hsv) => {
  const h = hsv.x;
  const s = hsv.y;
  const v = hsv.z;

  const i = std.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r = d.f32(0);
  let g = d.f32(0);
  let b = d.f32(0);
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
  return d.vec3f(r, g, b);
});

export const rgbToHsv = tgpu['~unstable'].fn([d.vec3f], d.vec3f).does((rgb) => {
  const r = rgb.x;
  const g = rgb.y;
  const b = rgb.z;

  const max = std.max(r, std.max(g, b));
  const min = std.min(r, std.min(g, b));
  const delta = d.f32(max - min);
  let h = d.f32(0);
  let s = d.f32(0);
  if (max === 0) {
    s = 0;
  } else {
    s = delta / max;
  }
  const v = max;

  if (max === min) {
    h = 0;
  } else if (max === r) {
    let cond = d.f32(0);
    if (g < b) {
      cond = 6;
    } else {
      cond = 0;
    }
    h = g - b + delta * cond;
    h /= 6 * delta;
  } else if (max === g) {
    h = b - r + delta * 2;
    h /= 6 * delta;
  } else if (max === b) {
    h = r - g + delta * 4;
    h /= 6 * delta;
  }

  return d.vec3f(h, s, v);
});

export const distance = tgpu['~unstable']
  .fn([d.vec3f, d.vec3f], d.f32)
  .does((v1, v2) => {
    const diff = std.sub(v1, v2);
    return std.pow(diff.x * diff.x + diff.y * diff.y + diff.z * diff.z, 0.5);
  });

// given a line and a point,
// calculate a vector from the line to the point of the shortest length
export const distanceVectorFromLine = tgpu['~unstable']
  .fn([d.vec3f, d.vec3f, d.vec3f], d.vec3f)
  .does((l1, l2, x) => {
    const d = std.normalize(std.sub(l2, l1));
    const v = std.sub(x, l1);
    const t = std.dot(v, d);
    const p = std.add(l1, std.mul(t, d));
    return std.sub(x, p);
  });

// given a vector and a normal of a plane,
// calculate a reflection vector
export const reflect = tgpu['~unstable']
  .fn([d.vec3f, d.vec3f], d.vec3f)
  .does((i, n) => std.sub(i, std.mul(2.0, std.mul(std.dot(n, i), n))));
