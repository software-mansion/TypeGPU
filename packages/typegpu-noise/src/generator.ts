import tgpu, { type TgpuFn, type TgpuFnShell, type TgpuSlot } from 'typegpu';
import * as d from 'typegpu/data';
import { add, cos, dot, fract, pow } from 'typegpu/std';

export interface StatefulGenerator {
  seed: TgpuFn<(seed: d.F32) => d.Void> | ((seed: number) => void);
  seed2?: TgpuFn<(seed: d.Vec2f) => d.Void> | ((seed: d.v2f) => void);
  seed3?: TgpuFn<(seed: d.Vec3f) => d.Void> | ((seed: d.v3f) => void);
  seed4?: TgpuFn<(seed: d.Vec4f) => d.Void> | ((seed: d.v4f) => void);
  sample: TgpuFn<() => d.F32> | (() => number);
}

export const randomGeneratorShell: TgpuFnShell<[], d.F32> = tgpu.fn([], d.f32);

/**
 * Incorporated from https://www.cg.tuwien.ac.at/research/publications/2023/PETER-2023-PSW/PETER-2023-PSW-.pdf
 * "Particle System in WebGPU" by Benedikt Peter
 */
export const BPETER: StatefulGenerator = (() => {
  const seed = tgpu.privateVar(d.vec2f);

  return {
    seed: tgpu.fn([d.f32])((value) => {
      seed.value = d.vec2f(value, 0);
    }),

    seed2: tgpu.fn([d.vec2f])((value) => {
      seed.value = value;
    }),

    seed3: tgpu.fn([d.vec3f])((value) => {
      seed.value = add(value.xy, d.vec2f(value.z));
    }),

    seed4: tgpu.fn([d.vec4f])((value) => {
      seed.value = add(value.xy, value.zw);
    }),

    sample: randomGeneratorShell(() => {
      'kernel';
      const a = dot(seed.value, d.vec2f(23.14077926, 232.61690225));
      const b = dot(seed.value, d.vec2f(54.47856553, 345.84153136));
      seed.value.x = fract(cos(a) * 136.8168);
      seed.value.y = fract(cos(b) * 534.7645);
      return seed.value.y;
    }),
  };
})();

/**
 * Naive Linear Congruential Generator (LCG)
 */
export const LCG: StatefulGenerator = (() => {
  const seed = tgpu.privateVar(d.u32);

  const u32To01Float = tgpu.fn([d.u32], d.f32)`(val){
    let exponent: u32 = 0x3f800000;
    let mantissa: u32 = 0x007fffff & val;
    var ufloat: u32 = (exponent | mantissa);
    return bitcast<f32>(ufloat) - 1f;
  }`;

  return {
    seed: (value: number) => {
      'kernel';
      seed.$ = d.u32(value * pow(32, 3));
    },
    seed2: (value: d.v2f) => {
      'kernel';
      seed.$ = d.u32(value.x * pow(32, 3) + value.y * pow(32, 2));
    },
    seed3: (value: d.v3f) => {
      'kernel';
      seed.$ = d.u32(
        value.x * pow(32, 3) + value.y * pow(32, 2) +
          value.z * pow(32, 1),
      );
    },
    seed4: (value: d.v4f) => {
      'kernel';
      seed.$ = d.u32(
        value.x * pow(32, 3) + value.y * pow(32, 2) +
          value.z * pow(32, 1) + value.w * pow(32, 0),
      );
    },
    sample: () => {
      'kernel';
      seed.$ = seed.$ * 1664525 + 1013904223; // % 2 ^ 32
      return u32To01Float(seed.$);
    },
  };
})();

// The default (Can change between releases to improve uniformity).
export const DefaultGenerator: StatefulGenerator = BPETER;

export const randomGeneratorSlot: TgpuSlot<StatefulGenerator> = tgpu.slot(
  DefaultGenerator,
);
