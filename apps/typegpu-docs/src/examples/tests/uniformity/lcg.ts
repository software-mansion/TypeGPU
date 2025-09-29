import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import type { StatefulGenerator } from '@typegpu/noise';

export const LCG: StatefulGenerator = (() => {
  const seed = tgpu.privateVar(d.u32);

  const u32ToFloat = tgpu.fn([d.u32], d.f32)`(val){
    let exponent: u32 = 0x3f800000;
    let mantissa: u32 = 0x007fffff & val;
    var ufloat: u32 = (exponent | mantissa);
    return bitcast<f32>(ufloat) - 1f;
  }`;

  return {
    seed: (value: number) => {
      'kernel';
      seed.$ = d.u32(value * std.pow(32, 3));
    },
    seed2: (value: d.v2f) => {
      'kernel';
      seed.$ = d.u32(value.x * std.pow(32, 3) + value.y * std.pow(32, 2));
    },
    seed3: (value: d.v3f) => {
      'kernel';
      seed.$ = d.u32(
        value.x * std.pow(32, 3) + value.y * std.pow(32, 2) +
          value.z * std.pow(32, 1),
      );
    },
    seed4: (value: d.v4f) => {
      'kernel';
      seed.$ = d.u32(
        value.x * std.pow(32, 3) + value.y * std.pow(32, 2) +
          value.z * std.pow(32, 1) + value.w * std.pow(32, 0),
      );
    },
    sample: () => {
      'kernel';
      seed.$ = seed.$ * 1664525 + 1013904223; // % 2 ^ 32
      return u32ToFloat(seed.$);
    },
  };
})();
