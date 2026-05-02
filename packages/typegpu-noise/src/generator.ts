import tgpu, { d, type TgpuFnShell, type TgpuSlot } from 'typegpu';
import { cos, dot, fract } from 'typegpu/std';
import { hash, rotl, u32To01F32 } from './utils.ts';

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

  const bitcast = tgpu['~unstable'].rawCodeSnippet('bitcast<vec3u>(value)', d.vec3u, 'runtime');

  return {
    seed3: tgpu.fn([d.vec3f])((value) => {
      const u32Value = bitcast.$;
      const hx = hash(u32Value.x ^ 0x4ab57dfb);
      const hy = hash(u32Value.y ^ 0xacdeda47);
      const hz = hash(u32Value.z ^ 0xbca0294b);
      seed.$ = d.vec2u(hash(hx ^ rotl(hz, 16)), hash(rotl(hy, 16) ^ hz));
    }),

    sample: randomGeneratorShell(() => {
      'use gpu';
      const r = next();
      return u32To01F32(r);
    }).$name('sample'),
  };
})();

// The default (Can change between releases to improve uniformity).
export const DefaultGenerator: StatefulGenerator = BPETER;

export const randomGeneratorSlot: TgpuSlot<StatefulGenerator> = tgpu.slot(DefaultGenerator);
