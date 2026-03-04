import type { StatefulGenerator } from '@typegpu/noise';
import tgpu, { d, std } from 'typegpu';

export const LCG: StatefulGenerator = (() => {
  const seed = tgpu.privateVar(d.u32);

  const u32To01Float = tgpu.fn(
    [d.u32],
    d.f32,
  )((value) => {
    const mantissa = value >> 9;
    const bits = 0x3f800000 | mantissa;
    const f = std.bitcastU32toF32(bits);
    return f - 1;
  });

  return {
    seed2: (value: d.v2f) => {
      'use gpu';
      seed.$ = d.u32(value.x * std.pow(32, 3) + value.y * std.pow(32, 2));
    },
    sample: () => {
      'use gpu';
      seed.$ = seed.$ * 1664525 + 1013904223; // % 2 ^ 32
      return u32To01Float(seed.$);
    },
  };
})();
