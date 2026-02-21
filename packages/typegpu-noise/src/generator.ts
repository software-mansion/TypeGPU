import tgpu, { d, type TgpuFnShell, type TgpuSlot } from 'typegpu';
import { cos, dot, fract } from 'typegpu/std';

export interface StatefulGenerator {
  seed?: (seed: number) => void;
  seed2?: (seed: d.v2f) => void;
  seed3?: (seed: d.v3f) => void;
  seed4?: (seed: d.v4f) => void;
  sample: () => number;
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
      seed.$ = d.vec2f(value, 0);
    }),

    seed2: tgpu.fn([d.vec2f])((value) => {
      seed.$ = d.vec2f(value);
    }),

    seed3: tgpu.fn([d.vec3f])((value) => {
      'use gpu';
      seed.$ = value.xy + d.vec2f(value.z);
    }),

    seed4: tgpu.fn([d.vec4f])((value) => {
      'use gpu';
      seed.$ = value.xy + value.zw;
    }),

    sample: randomGeneratorShell(() => {
      'use gpu';
      const a = dot(seed.$, d.vec2f(23.14077926, 232.61690225));
      const b = dot(seed.$, d.vec2f(54.47856553, 345.84153136));
      seed.$.x = fract(cos(a) * 136.8168);
      seed.$.y = fract(cos(b) * 534.7645);
      return seed.$.y;
    }).$name('sample'),
  };
})();

// The default (Can change between releases to improve uniformity).
export const DefaultGenerator: StatefulGenerator = BPETER;

export const randomGeneratorSlot: TgpuSlot<StatefulGenerator> = tgpu.slot(
  DefaultGenerator,
);
