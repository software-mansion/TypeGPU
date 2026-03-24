import tgpu, { d, type TgpuFnShell, type TgpuSlot } from 'typegpu';
import { cos, dot, fract } from 'typegpu/std';
import { hash, rotl, u32To01F32, u64Add, u64Mul } from './utils.ts';

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
      const hx = hash(d.u32(value.x) ^ 2135587861);
      const hy = hash(d.u32(value.y) ^ 2654435769);
      seed.$ = d.vec2u(hash(hx ^ hy), hash(rotl(hx, 16) ^ hy));
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

  const multiplier = d.u32(1664525);
  const increment = d.u32(1013904223);

  return {
    seed: tgpu.fn([d.f32])((value) => {
      seed.$ = hash(d.u32(value));
    }),

    sample: randomGeneratorShell(() => {
      'use gpu';
      seed.$ = multiplier * seed.$ + increment; // % 2 ^ 32
      return u32To01F32(seed.$);
    }).$name('sample'),
  };
})();

/**
 * Naive Linear Congruential Generator (LCG) with 64 bits state
 * Incorporated from: https://en.wikipedia.org/wiki/Linear_congruential_generator (Musl)
 */
export const LCG64: StatefulGenerator = (() => {
  const seed = tgpu.privateVar(d.vec2u);

  // 1481765933 * 2 ** 32 + 1284865837 = 6364136223846793005
  const multiplier = d.vec2u(1284865837, 1481765933);
  const increment = d.vec2u(1, 0);

  return {
    seed2: tgpu.fn([d.vec2f])((value) => {
      const hx = hash(d.u32(value.x) ^ 2135587861);
      const hy = hash(d.u32(value.y) ^ 2654435769);
      seed.$ = d.vec2u(hash(hx ^ hy), hash(rotl(hx, 16) ^ hy));
    }),

    sample: randomGeneratorShell(() => {
      'use gpu';
      seed.$ = u64Add(u64Mul(seed.$, multiplier), increment);
      return u32To01F32(seed.$.y);
    }).$name('sample'),
  };
})();

// The default (Can change between releases to improve uniformity).
export const DefaultGenerator: StatefulGenerator = BPETER;

export const randomGeneratorSlot: TgpuSlot<StatefulGenerator> = tgpu.slot(DefaultGenerator);
