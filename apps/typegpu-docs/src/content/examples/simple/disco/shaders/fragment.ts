import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { palette } from '../utils.ts';
import { resolutionAccess, timeAccess } from '../consts.ts';

const aspectCorrected = tgpu.fn([d.vec2f], d.vec2f)((uv) => {
  const v = uv.xy.sub(0.5).mul(2.0);
  const aspect = resolutionAccess.$.x / resolutionAccess.$.y;
  if (aspect > 1) v.x *= aspect;
  else v.y /= aspect;
  return v;
});

const accumulate = tgpu.fn(
  [d.vec3f, d.vec3f, d.f32],
  d.vec3f,
)((acc, col, weight) => acc.add(col.mul(weight)));

export const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  {
    let newuv = aspectCorrected(uv);
    const uvv = newuv;
    let finalColor = d.vec3f();
    for (let i = 0.0; i < 5.0; i++) {
      newuv = std.sub(
        std.fract(std.mul(newuv, 1.3 * std.sin(timeAccess.$))),
        0.5,
      );
      let len = std.length(newuv) * std.exp(-std.length(uvv) * 2);
      const col = palette(std.length(uvv) + timeAccess.$ * 0.9);
      len = std.sin(len * 8 + timeAccess.$) / 8;
      len = std.abs(len);
      len = std.smoothstep(0.0, 0.1, len);
      len = 0.06 / len;
      finalColor = accumulate(finalColor, col, len);
    }
    return d.vec4f(finalColor, 1.0);
  }
});

// Variation2
export const mainFragment2 = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  {
    let newuv = aspectCorrected(uv);
    const uvv = newuv;
    let finalColor = d.vec3f();
    for (let i = 0.0; i < 3.0; i++) {
      newuv = std.fract(newuv.mul(-0.9)).sub(0.5);
      let len = std.length(newuv) * std.exp(-std.length(uvv) * 0.5);
      const col = palette(std.length(uvv) + timeAccess.$ * 0.9);
      len = std.sin(len * 8 + timeAccess.$) / 8;
      len = std.abs(len);
      len = std.smoothstep(0.0, 0.1, len);
      len = 0.1 / len;
      finalColor = accumulate(finalColor, col, len);
    }
    return d.vec4f(finalColor, 1.0);
  }
});

// Variation3
export const mainFragment3 = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  let newuv = aspectCorrected(uv);
  const uvv = newuv;
  let finalColor = d.vec3f();
  const baseAngle = timeAccess.$ * 0.3;
  const ca = std.cos(baseAngle);
  const sa = std.sin(baseAngle);
  for (let i = 0; i < 4; i++) {
    const fi = d.f32(i);
    // fractional warp
    const rx = newuv.x * ca - newuv.y * sa;
    const ry = newuv.x * sa + newuv.y * ca;
    newuv = d.vec2f(rx, ry);
    // subtle radial zoom per iteration
    newuv = newuv.mul(1.15 + fi * 0.05);
    newuv = std.sub(
      std.fract(std.mul(newuv, 1.2 * std.sin(timeAccess.$ * 0.9 + fi * 0.3))),
      0.5,
    );
    let len = std.length(newuv) * std.exp(-std.length(uvv) * 1.6);
    const col = palette(std.length(uvv) + timeAccess.$ * 0.8 + fi * 0.05);
    len = std.sin(len * 7.0 + timeAccess.$ * 0.9) / 8.0;
    len = std.abs(len);
    len = std.smoothstep(0.0, 0.11, len);
    len = 0.055 / (len + 1e-5);
    finalColor = accumulate(finalColor, col, len);
  }
  return d.vec4f(finalColor, 1.0);
});

// Variation4
export const mainFragment4 = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  // iterative bloom
  let newuv = aspectCorrected(uv);
  // diagonal mirror
  const base = d.vec2f(
    std.abs(std.fract(newuv.x * 1.2) - 0.5),
    std.abs(std.fract(newuv.y * 1.2) - 0.5),
  ).mul(2).sub(1);
  newuv = base;
  const origin = newuv;
  let finalColor = d.vec3f(0, 0, 0);
  const t = timeAccess.$;
  for (let i = 0; i < 4; i++) {
    const fi = d.f32(i);
    // rotation + scale
    const ang = t * (0.4 + fi * 0.1) + fi * 0.9;
    const ca = std.cos(ang);
    const sa = std.sin(ang);
    const rx = newuv.x * ca - newuv.y * sa;
    const ry = newuv.x * sa + newuv.y * ca;
    newuv = d.vec2f(rx, ry).mul(1.1 + fi * 0.07);
    // fractional warp
    newuv = std.fract(newuv.mul(1.25 + fi * 0.15)).sub(0.5);
    // radial falloff relative to original space
    let len = std.length(newuv) *
      std.exp(-std.length(origin) * (1.3 + fi * 0.06));
    len = std.sin(len * (7.2 + fi * 0.8) + t * (1.1 + fi * 0.2)) / 8.0;
    len = std.abs(len);
    len = std.smoothstep(0.0, 0.105, len);
    len = (0.058 + fi * 0.006) / (len + 1e-5);
    const col = palette(std.length(origin) + t * 0.65 + fi * 0.045);
    finalColor = accumulate(finalColor, col, len);
  }
  return d.vec4f(finalColor, 1.0);
});

// Variation5
export const mainFragment5 = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  let newuv = aspectCorrected(uv);
  const uvv = newuv;
  let finalColor = d.vec3f();
  for (let i = 0; i < 3; i++) {
    const fi = d.f32(i);
    // swirl distortion
    const r = std.length(newuv) + 1e-4;
    const ang = r * (8.0 + fi * 2.0) - timeAccess.$ * (1.5 + fi * 0.2);
    const ca = std.cos(ang);
    const sa = std.sin(ang);
    const rx = newuv.x * ca - newuv.y * sa;
    const ry = newuv.x * sa + newuv.y * ca;
    newuv = d.vec2f(rx, ry).mul(-0.85 - fi * 0.07);
    newuv = std.fract(newuv).sub(0.5);
    let len = std.length(newuv) * std.exp(-std.length(uvv) * (0.4 + fi * 0.1));
    const col = palette(std.length(uvv) + timeAccess.$ * 0.9 + fi * 0.08);
    len = std.sin(len * (6.0 + fi) + timeAccess.$) / 8.0;
    len = std.abs(len);
    len = std.smoothstep(0.0, 0.1, len);
    len = (0.085 + fi * 0.005) / (len + 1e-5);
    finalColor = accumulate(finalColor, col, len);
  }
  return d.vec4f(finalColor, 1.0);
});

// Variation6
export const mainFragment6 = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  let newuv = aspectCorrected(uv);
  const base = newuv;
  let colorAcc = d.vec3f(0, 0, 0);
  const t = timeAccess.$;
  for (let i = 0; i < 5; i++) {
    const fi = d.f32(i);
    // radial scale and rotation
    const ang = t * (0.25 + fi * 0.05) + fi * 0.6;
    const ca = std.cos(ang);
    const sa = std.sin(ang);
    const rx = newuv.x * ca - newuv.y * sa;
    const ry = newuv.x * sa + newuv.y * ca;
    newuv = d.vec2f(rx, ry).mul(1.08 + fi * 0.04);
    // layering
    const warped = std.fract(newuv.mul(1.3 + fi * 0.2)).sub(0.5);
    let len = std.length(warped) *
      std.exp(-std.length(base) * (1.4 + fi * 0.05));
    len = std.sin(len * (7.0 + fi * 0.7) + t * (0.9 + fi * 0.15)) / 8.0;
    len = std.abs(len);
    len = std.smoothstep(0.0, 0.1, len);
    len = (0.05 + fi * 0.005) / (len + 1e-5);
    const col = palette(std.length(base) + t * 0.7 + fi * 0.04);
    colorAcc = accumulate(colorAcc, col, len);
  }
  return d.vec4f(colorAcc, 1.0);
});

// Variation7
export const mainFragment7 = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  let newuv = aspectCorrected(uv);
  // mirror diagonally
  newuv = d.vec2f(
    std.abs(std.fract(newuv.x * 1.5) - 0.5),
    std.abs(std.fract(newuv.y * 1.5) - 0.5),
  ).mul(2);
  const base = newuv;
  let finalColor = d.vec3f(0, 0, 0);
  const t = timeAccess.$;
  for (let i = 0; i < 4; i++) {
    const fi = d.f32(i);
    // combine rotation with scaling
    const ang = fi * 0.8 + t * 0.35;
    const ca = std.cos(ang);
    const sa = std.sin(ang);
    const rx = newuv.x * ca - newuv.y * sa;
    const ry = newuv.x * sa + newuv.y * ca;
    newuv = d.vec2f(rx, ry).mul(1.18 + fi * 0.06);
    // swirl offset
    const r = std.length(newuv) + 1e-4;
    const swirl = std.sin(r * 10 - t * (1.2 + fi * 0.2));
    newuv = newuv.add(d.vec2f(swirl * 0.02, swirl * -0.02));
    let len = std.length(newuv) *
      std.exp(-std.length(base) * (1.2 + fi * 0.08));
    len = std.sin(len * (7.5 + fi) + t * (1.0 + fi * 0.1)) / 8.0;
    len = std.abs(len);
    len = std.smoothstep(0.0, 0.11, len);
    len = (0.06 + fi * 0.005) / (len + 1e-5);
    const col = palette(std.length(base) + t * 0.75 + fi * 0.05);
    finalColor = accumulate(finalColor, col, len);
  }
  return d.vec4f(finalColor, 1.0);
});
