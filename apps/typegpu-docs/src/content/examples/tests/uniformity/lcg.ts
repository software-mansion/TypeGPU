import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { randomGeneratorShell, type StatefulGenerator } from '@typegpu/noise';

export const LCG: StatefulGenerator = (() => {
  const seed = tgpu['~unstable'].privateVar(d.u32);

  const u32ToFloat = tgpu.fn([d.u32], d.f32)`(val){
    let exponent: u32 = 0x3f800000;
    let mantissa: u32 = 0x007fffff & val;
    var ufloat: u32 = (exponent | mantissa);
    return bitcast<f32>(ufloat) - 1f;
  }`;

  return {
    seed: tgpu.fn([d.f32])((value) => {
      seed.$ = d.u32(value * std.pow(32, 3));
    }),
    seed2: tgpu.fn([d.vec2f])((value) => {
      seed.$ = d.u32(value.x * std.pow(32, 3) + value.y * std.pow(32, 2));
    }),
    seed3: tgpu.fn([d.vec3f])((value) => {
      seed.$ = d.u32(
        value.x * std.pow(32, 3) + value.y * std.pow(32, 2) +
          value.z * std.pow(32, 1),
      );
    }),
    seed4: tgpu.fn([d.vec4f])((value) => {
      seed.$ = d.u32(
        value.x * std.pow(32, 3) + value.y * std.pow(32, 2) +
          value.z * std.pow(32, 1) + value.w * std.pow(32, 0),
      );
    }),
    sample: randomGeneratorShell(() => {
      'kernel';
      seed.$ = seed.$ * 1664525 + 1013904223; // % 2 ^ 32
      return u32ToFloat(seed.$);
    }),
  };
})();
