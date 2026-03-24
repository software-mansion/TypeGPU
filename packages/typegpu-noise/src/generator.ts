import tgpu, { d, type TgpuFnShell, type TgpuSlot } from 'typegpu';
import { cos, dot, fract } from 'typegpu/std';
import { hash, u32To01F32 } from './utils.ts';

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

/**
 * Incorporated from https://github.com/chaos-matters/chaos-master
 * by deluksic and Komediruzecki
 */
export const XOROSHIRO64STARSTAR: StatefulGenerator = (() => {
  const seed = tgpu.privateVar(d.vec2u);

  const rotl = tgpu.fn(
    [d.u32, d.u32],
    d.u32,
  )((x, k) => {
    return (x << k) | (x >> (32 - k));
  });

  const next = tgpu.fn(
    [],
    d.u32,
  )(() => {
    const s0 = seed.$[0];
    let s1 = seed.$[1];
    s1 ^= s0;
    seed.$[0] = rotl(s0, 26) ^ s1 ^ (s1 << 9);
    seed.$[1] = rotl(s1, 13);
    return rotl(seed.$[0] * 0x9e3779bb, 5) * 5;
  });

  return {
    seed2: tgpu.fn([d.vec2f])((value) => {
      seed.$ = d.vec2u(hash(d.u32(value.x)), hash(d.u32(value.y)));
    }),

    sample: randomGeneratorShell(() => {
      'use gpu';
      const r = next();
      return u32To01F32(r);
    }).$name('sample'),
  };
})();

/**
 * Naive Linear Congruential Generator (LCG) with 32 bits state
 */
export const LCG32: StatefulGenerator = (() => {
  const seed = tgpu.privateVar(d.u32);

  return {
    seed: tgpu.fn([d.f32])((value) => {
      seed.$ = hash(d.u32(value));
    }),

    sample: randomGeneratorShell(() => {
      'use gpu';
      seed.$ = seed.$ * 1664525 + 1013904223; // % 2 ^ 32
      return u32To01F32(seed.$);
    }).$name('sample'),
  };
})();

/**
 * Naive Linear Congruential Generator (LCG) with 64 bits state
 */
export const LCG64: StatefulGenerator = (() => {
  const seed = tgpu.privateVar(d.u32);

  return {
    seed: tgpu.fn([d.f32])((value) => {
      seed.$ = d.u32(value) * 1048577;
    }),

    sample: randomGeneratorShell(() => {
      'use gpu';
      seed.$ = seed.$ * 1664525 + 1013904223; // % 2 ^ 32
      return u32To01F32(seed.$);
    }).$name('sample'),
  };
})();

// The default (Can change between releases to improve uniformity).
export const DefaultGenerator: StatefulGenerator = BPETER;

export const randomGeneratorSlot: TgpuSlot<StatefulGenerator> = tgpu.slot(DefaultGenerator);
