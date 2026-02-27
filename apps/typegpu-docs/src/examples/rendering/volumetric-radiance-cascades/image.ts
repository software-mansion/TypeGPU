import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

// ACES tonemapping fit for the sRGB color space
// https://github.com/TheRealMJP/BakingLab/blob/master/BakingLab/ACES.hlsl
export const tonemapACES = (colorArg: d.v3f): d.v3f => {
  'use gpu';
  let color = colorArg.xyz;

  // sRGB => XYZ => D65_2_D60 => AP1 => RRT_SAT
  const acesInputMat = d.mat3x3f(
    0.59719,
    0.07600,
    0.02840,
    0.35458,
    0.90834,
    0.13383,
    0.04823,
    0.01566,
    0.83777,
  );

  // ODT_SAT => XYZ => D60_2_D65 => sRGB
  const acesOutputMat = d.mat3x3f(
    1.60475,
    -0.10208,
    -0.00327,
    -0.53108,
    1.10813,
    -0.07276,
    -0.07367,
    -0.00605,
    1.07602,
  );

  color = acesInputMat.mul(color);

  // Apply RRT and ODT
  const a = color.mul(color.add(0.0245786)).sub(0.000090537);
  const b = color.mul(color.mul(0.983729).add(0.4329510)).add(0.238081);
  color = a.div(b);

  color = acesOutputMat.mul(color);

  // Clamp to [0, 1]
  return std.clamp(color, d.vec3f(0.0), d.vec3f(1.0));
};

export const gammaSRGB = (linearSRGB: d.v3f) => {
  'use gpu';
  const a = linearSRGB.mul(12.92);
  const b = std.pow(linearSRGB, d.vec3f(1.0 / 2.4)).mul(1.055).sub(0.055);
  const c = std.step(d.vec3f(0.0031308), linearSRGB);
  return std.mix(a, b, c);
};

export const exposure = 1.0;
