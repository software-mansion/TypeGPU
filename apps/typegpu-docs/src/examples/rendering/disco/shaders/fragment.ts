import tgpu, { d, std } from 'typegpu';
import { resolutionAccess, timeAccess } from '../consts.ts';
import { palette } from '../utils.ts';

const aspectCorrected = (uv: d.v2f): d.v2f => {
  'use gpu';
  const v = uv.sub(0.5).mul(2);
  const aspect = resolutionAccess.$.x / resolutionAccess.$.y;
  if (aspect > 1) {
    v.x *= aspect;
  } else {
    v.y /= aspect;
  }
  return v;
};

const accumulate = tgpu.fn(
  [d.vec3f, d.vec3f, d.f32],
  d.vec3f,
)((acc, col, weight) => acc.add(col.mul(weight)));

// Variation1
export const mainFragment1 = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const originalUv = aspectCorrected(uv);

  let aspectUv = d.vec2f(originalUv);
  let accumulatedColor = d.vec3f();
  for (let iteration = 0.0; iteration < 5.0; iteration++) {
    aspectUv = std.fract(aspectUv.mul(1.3 * std.sin(timeAccess.$))).sub(0.5);
    let radialLength = std.length(aspectUv) * std.exp(-std.length(originalUv) * 2);
    radialLength = std.sin(radialLength * 8 + timeAccess.$) / 8;
    radialLength = std.abs(radialLength);
    radialLength = std.smoothstep(0.0, 0.1, radialLength);
    radialLength = 0.06 / radialLength;

    const paletteColor = palette(std.length(originalUv) + timeAccess.$ * 0.9);
    accumulatedColor = accumulate(accumulatedColor, paletteColor, radialLength);
  }
  return d.vec4f(accumulatedColor, 1.0);
});

// Variation2
export const mainFragment2 = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const originalUv = aspectCorrected(uv);
  let aspectUv = d.vec2f(originalUv);

  let accumulatedColor = d.vec3f();
  for (let iteration = 0.0; iteration < 3.0; iteration++) {
    aspectUv = std.fract(aspectUv.mul(-0.9)).sub(0.5);
    let radialLength = std.length(aspectUv) * std.exp(-std.length(originalUv) * 0.5);
    const paletteColor = palette(std.length(originalUv) + timeAccess.$ * 0.9);
    radialLength = std.sin(radialLength * 8 + timeAccess.$) / 8;
    radialLength = std.abs(radialLength);
    radialLength = std.smoothstep(0.0, 0.1, radialLength);
    radialLength = 0.1 / radialLength;
    accumulatedColor = accumulate(accumulatedColor, paletteColor, radialLength);
  }
  return d.vec4f(accumulatedColor, 1.0);
});

// Variation3
export const mainFragment3 = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const originalUv = aspectCorrected(uv);
  let aspectUv = d.vec2f(originalUv);

  let accumulatedColor = d.vec3f();
  const baseAngle = timeAccess.$ * 0.3;
  const cosBaseAngle = std.cos(baseAngle);
  const sinBaseAngle = std.sin(baseAngle);
  for (let iteration = 0; iteration < 4; iteration++) {
    const iterationF32 = d.f32(iteration);
    // fractional warp
    const rotatedX = aspectUv.x * cosBaseAngle - aspectUv.y * sinBaseAngle;
    const rotatedY = aspectUv.x * sinBaseAngle + aspectUv.y * cosBaseAngle;
    aspectUv = d.vec2f(rotatedX, rotatedY);
    // subtle radial zoom per iteration
    aspectUv = aspectUv.mul(1.15 + iterationF32 * 0.05);
    aspectUv = std.sub(
      std.fract(std.mul(aspectUv, 1.2 * std.sin(timeAccess.$ * 0.9 + iterationF32 * 0.3))),
      0.5,
    );
    let radialLength = std.length(aspectUv) * std.exp(-std.length(originalUv) * 1.6);
    const paletteColor = palette(std.length(originalUv) + timeAccess.$ * 0.8 + iterationF32 * 0.05);
    radialLength = std.sin(radialLength * 7.0 + timeAccess.$ * 0.9) / 8.0;
    radialLength = std.abs(radialLength);
    radialLength = std.smoothstep(0.0, 0.11, radialLength);
    radialLength = 0.055 / (radialLength + 1e-5);
    accumulatedColor = accumulate(accumulatedColor, paletteColor, radialLength);
  }
  return d.vec4f(accumulatedColor, 1.0);
});

// Variation4
export const mainFragment4 = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  // iterative bloom
  let aspectUv = aspectCorrected(uv);
  // diagonal mirror
  const mirroredUv = d
    .vec2f(std.abs(std.fract(aspectUv.x * 1.2) - 0.5), std.abs(std.fract(aspectUv.y * 1.2) - 0.5))
    .mul(2)
    .sub(1);
  aspectUv = d.vec2f(mirroredUv);
  const originalUv = d.vec2f(aspectUv);
  let accumulatedColor = d.vec3f(0, 0, 0);
  const time = timeAccess.$;

  for (let iteration = 0; iteration < 4; iteration++) {
    const iterationF32 = d.f32(iteration);
    // rotation + scale
    const angle = time * (0.4 + iterationF32 * 0.1) + iterationF32 * 0.9;
    const cosAngle = std.cos(angle);
    const sinAngle = std.sin(angle);
    const rotatedX = aspectUv.x * cosAngle - aspectUv.y * sinAngle;
    const rotatedY = aspectUv.x * sinAngle + aspectUv.y * cosAngle;
    aspectUv = d.vec2f(rotatedX, rotatedY).mul(1.1 + iterationF32 * 0.07);
    // fractional warp
    aspectUv = std.fract(aspectUv.mul(1.25 + iterationF32 * 0.15)).sub(0.5);
    // radial falloff relative to original space
    let radialLength =
      std.length(aspectUv) * std.exp(-std.length(originalUv) * (1.3 + iterationF32 * 0.06));
    radialLength =
      std.sin(radialLength * (7.2 + iterationF32 * 0.8) + time * (1.1 + iterationF32 * 0.2)) / 8.0;
    radialLength = std.abs(radialLength);
    radialLength = std.smoothstep(0.0, 0.105, radialLength);
    radialLength = (0.058 + iterationF32 * 0.006) / (radialLength + 1e-5);
    const paletteColor = palette(std.length(originalUv) + time * 0.65 + iterationF32 * 0.045);
    accumulatedColor = accumulate(accumulatedColor, paletteColor, radialLength);
  }

  return d.vec4f(accumulatedColor, 1.0);
});

// Variation5
export const mainFragment5 = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const originalUv = aspectCorrected(uv);
  let aspectUv = d.vec2f(originalUv);
  let accumulatedColor = d.vec3f();

  for (let iteration = 0; iteration < 3; iteration++) {
    const iterationF32 = d.f32(iteration);
    // swirl distortion
    const radius = std.length(aspectUv) + 1e-4;
    const angle = radius * (8.0 + iterationF32 * 2.0) - timeAccess.$ * (1.5 + iterationF32 * 0.2);
    const cosAngle = std.cos(angle);
    const sinAngle = std.sin(angle);
    const rotatedX = aspectUv.x * cosAngle - aspectUv.y * sinAngle;
    const rotatedY = aspectUv.x * sinAngle + aspectUv.y * cosAngle;
    aspectUv = d.vec2f(rotatedX, rotatedY).mul(-0.85 - iterationF32 * 0.07);
    aspectUv = std.fract(aspectUv).sub(0.5);
    let radialLength =
      std.length(aspectUv) * std.exp(-std.length(originalUv) * (0.4 + iterationF32 * 0.1));
    const paletteColor = palette(std.length(originalUv) + timeAccess.$ * 0.9 + iterationF32 * 0.08);
    radialLength = std.sin(radialLength * (6.0 + iterationF32) + timeAccess.$) / 8.0;
    radialLength = std.abs(radialLength);
    radialLength = std.smoothstep(0.0, 0.1, radialLength);
    radialLength = (0.085 + iterationF32 * 0.005) / (radialLength + 1e-5);
    accumulatedColor = accumulate(accumulatedColor, paletteColor, radialLength);
  }
  return d.vec4f(accumulatedColor, 1.0);
});

// Variation6
export const mainFragment6 = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  let aspectUv = aspectCorrected(uv);
  const originalUv = d.vec2f(aspectUv);

  let accumulatedColor = d.vec3f(0, 0, 0);
  const time = timeAccess.$;
  for (let iteration = 0; iteration < 5; iteration++) {
    const iterationF32 = d.f32(iteration);
    // radial scale and rotation
    const angle = time * (0.25 + iterationF32 * 0.05) + iterationF32 * 0.6;
    const cosAngle = std.cos(angle);
    const sinAngle = std.sin(angle);
    const rotatedX = aspectUv.x * cosAngle - aspectUv.y * sinAngle;
    const rotatedY = aspectUv.x * sinAngle + aspectUv.y * cosAngle;
    aspectUv = d.vec2f(rotatedX, rotatedY).mul(1.08 + iterationF32 * 0.04);
    // layering
    const warpedUv = std.fract(aspectUv.mul(1.3 + iterationF32 * 0.2)).sub(0.5);
    let radialLength =
      std.length(warpedUv) * std.exp(-std.length(originalUv) * (1.4 + iterationF32 * 0.05));
    radialLength =
      std.sin(radialLength * (7.0 + iterationF32 * 0.7) + time * (0.9 + iterationF32 * 0.15)) / 8.0;
    radialLength = std.abs(radialLength);
    radialLength = std.smoothstep(0.0, 0.1, radialLength);
    radialLength = (0.05 + iterationF32 * 0.005) / (radialLength + 1e-5);
    const paletteColor = palette(std.length(originalUv) + time * 0.7 + iterationF32 * 0.04);
    accumulatedColor = accumulate(accumulatedColor, paletteColor, radialLength);
  }
  return d.vec4f(accumulatedColor, 1.0);
});

// Variation7
export const mainFragment7 = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  let aspectUv = aspectCorrected(uv);
  // mirror diagonally
  aspectUv = d
    .vec2f(std.abs(std.fract(aspectUv.x * 1.5) - 0.5), std.abs(std.fract(aspectUv.y * 1.5) - 0.5))
    .mul(2);
  const originalUv = d.vec2f(aspectUv);
  let accumulatedColor = d.vec3f(0, 0, 0);
  const time = timeAccess.$;
  for (let iteration = 0; iteration < 4; iteration++) {
    const iterationF32 = d.f32(iteration);
    // combine rotation with scaling
    const angle = iterationF32 * 0.8 + time * 0.35;
    const cosAngle = std.cos(angle);
    const sinAngle = std.sin(angle);
    const rotatedX = aspectUv.x * cosAngle - aspectUv.y * sinAngle;
    const rotatedY = aspectUv.x * sinAngle + aspectUv.y * cosAngle;
    aspectUv = d.vec2f(rotatedX, rotatedY).mul(1.18 + iterationF32 * 0.06);
    // swirl offset
    const radius = std.length(aspectUv) + 1e-4;
    const swirl = std.sin(radius * 10 - time * (1.2 + iterationF32 * 0.2));
    aspectUv = aspectUv.add(d.vec2f(swirl * 0.02, swirl * -0.02));
    let radialLength =
      std.length(aspectUv) * std.exp(-std.length(originalUv) * (1.2 + iterationF32 * 0.08));
    radialLength =
      std.sin(radialLength * (7.5 + iterationF32) + time * (1.0 + iterationF32 * 0.1)) / 8.0;
    radialLength = std.abs(radialLength);
    radialLength = std.smoothstep(0.0, 0.11, radialLength);
    radialLength = (0.06 + iterationF32 * 0.005) / (radialLength + 1e-5);
    const paletteColor = palette(std.length(originalUv) + time * 0.75 + iterationF32 * 0.05);
    accumulatedColor = accumulate(accumulatedColor, paletteColor, radialLength);
  }
  return d.vec4f(accumulatedColor, 1.0);
});
