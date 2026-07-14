import { tgpu, d, type TgpuFnShell, type TgpuSlot, std } from 'typegpu';
import {
  hash,
  rotl,
  scrambleSeed,
  scrambleSeed2,
  scrambleSeed3,
  scrambleSeed4,
  u32To01F32,
} from './utils.ts';

export interface StatefulGenerator {
  seed?: (seed: number) => void;
  seed2?: (seed: d.v2f) => void;
  seed3?: (seed: d.v3f) => void;
  seed4?: (seed: d.v4f) => void;
  sample: () => number;
}

export const randomGeneratorShell: TgpuFnShell<[], d.F32> = tgpu.fn([], d.f32);

const cpuImplNotAvailable = (prng: string, fn: string) => {
  throw new Error(`CPU implementation of ${prng}:${fn} is not available`);
};

/**
 * Incorporated from https://www.cg.tuwien.ac.at/research/publications/2023/PETER-2023-PSW/PETER-2023-PSW-.pdf
 * "Particle System in WebGPU" by Benedikt Peter
 */
export const BPETER: StatefulGenerator = (() => {
  const gpuSeed = tgpu.privateVar(d.vec2f);

  return {
    seed: tgpu.fn([d.f32])((value) => {
      'use gpu';
      if (!std.isBeingTranspiled()) {
        cpuImplNotAvailable('BPETER', 'seed');
      }

      const scrambled = scrambleSeed(value);
      gpuSeed.$ =
        d.vec2f(u32To01F32(hash(scrambled)), u32To01F32(hash(rotl(scrambled, 16)))) * 2 - 1;
    }),

    seed2: tgpu.fn([d.vec2f])((value) => {
      'use gpu';
      if (!std.isBeingTranspiled()) {
        cpuImplNotAvailable('BPETER', 'seed2');
      }

      const scrambled = scrambleSeed2(value);
      gpuSeed.$ =
        d.vec2f(
          u32To01F32(hash(scrambled.x ^ scrambled.y)),
          u32To01F32(hash(rotl(scrambled.x, 16) ^ scrambled.y)),
        ) *
          2 -
        1;
    }),

    seed3: tgpu.fn([d.vec3f])((value) => {
      'use gpu';
      if (!std.isBeingTranspiled()) {
        cpuImplNotAvailable('BPETER', 'seed3');
      }

      const scrambled = scrambleSeed3(value);
      gpuSeed.$ =
        d.vec2f(
          u32To01F32(hash(scrambled.x ^ rotl(scrambled.z, 16))),
          u32To01F32(hash(rotl(scrambled.y, 16) ^ scrambled.z)),
        ) *
          2 -
        1;
    }),

    seed4: tgpu.fn([d.vec4f])((value) => {
      'use gpu';
      if (!std.isBeingTranspiled()) {
        cpuImplNotAvailable('BPETER', 'seed4');
      }

      const scrambled = scrambleSeed4(value);
      gpuSeed.$ =
        d.vec2f(
          u32To01F32(hash(scrambled.x ^ rotl(scrambled.z, 16) ^ rotl(scrambled.w, 8))),
          u32To01F32(hash(rotl(scrambled.y, 16) ^ scrambled.z ^ scrambled.w)),
        ) *
          2 -
        1;
    }),

    sample: randomGeneratorShell(() => {
      'use gpu';
      if (!std.isBeingTranspiled()) {
        cpuImplNotAvailable('BPETER', 'sample');
      }

      const a = std.dot(gpuSeed.$, d.vec2f(23.14077926, 232.61690225));
      const b = std.dot(gpuSeed.$, d.vec2f(54.47856553, 345.84153136));
      gpuSeed.$.x = std.fract(std.cos(a) * 136.8168);
      gpuSeed.$.y = std.fract(std.cos(b) * 534.7645);
      return gpuSeed.$.y;
    }).$name('sample'),
  };
})();

/**
 * Incorporated from https://github.com/chaos-matters/chaos-master
 * by deluksic and Komediruzecki
 */
export const XOROSHIRO64STARSTAR: StatefulGenerator = (() => {
  const gpuSeed = tgpu.privateVar(d.vec2u);
  let cpuSeed = d.vec2u();

  function updateCpuSeed(seed: d.v2u) {
    cpuSeed = seed;
  }

  const next = tgpu.fn(
    [],
    d.u32,
  )(() => {
    if (std.isBeingTranspiled()) {
      const s0 = gpuSeed.$[0];
      let s1 = gpuSeed.$[1];
      s1 ^= s0;
      gpuSeed.$[0] = rotl(s0, 26) ^ s1 ^ (s1 << 9);
      gpuSeed.$[1] = rotl(s1, 13);
      return rotl(gpuSeed.$[0] * 0x9e3779bb, 5) * 5;
    } else {
      const s0 = cpuSeed[0];
      let s1 = cpuSeed[1];
      s1 ^= s0;
      updateCpuSeed(d.vec2u(rotl(s0, 26) ^ s1 ^ (s1 << 9), rotl(s1, 13)));
      const temp = Math.imul(cpuSeed[0], 0x9e3779bb);
      return Math.imul(rotl(temp, 5), 5);
    }
  });

  return {
    seed: tgpu.fn([d.f32])((value) => {
      const scrambled = scrambleSeed(value);
      const newSeed = d.vec2u(hash(scrambled), hash(rotl(scrambled, 16)));

      if (std.isBeingTranspiled()) {
        gpuSeed.$ = d.vec2u(newSeed);
      } else {
        updateCpuSeed(newSeed);
      }
    }),
    seed2: tgpu.fn([d.vec2f])((value) => {
      const scrambled = scrambleSeed2(value);
      const newSeed = d.vec2u(
        hash(scrambled.x ^ scrambled.y),
        hash(rotl(scrambled.x, 16) ^ scrambled.y),
      );

      if (std.isBeingTranspiled()) {
        gpuSeed.$ = d.vec2u(newSeed);
      } else {
        updateCpuSeed(newSeed);
      }
    }),

    seed3: tgpu.fn([d.vec3f])((value) => {
      const scrambled = scrambleSeed3(value);
      const newSeed = d.vec2u(
        hash(scrambled.x ^ rotl(scrambled.z, 16)),
        hash(rotl(scrambled.y, 16) ^ scrambled.z),
      );

      if (std.isBeingTranspiled()) {
        gpuSeed.$ = d.vec2u(newSeed);
      } else {
        updateCpuSeed(newSeed);
      }
    }),

    seed4: tgpu.fn([d.vec4f])((value) => {
      const scrambled = scrambleSeed4(value);
      const newSeed = d.vec2u(
        hash(scrambled.x ^ rotl(scrambled.z, 16) ^ rotl(scrambled.w, 8)),
        hash(rotl(scrambled.y, 16) ^ scrambled.z ^ scrambled.w),
      );

      if (std.isBeingTranspiled()) {
        gpuSeed.$ = d.vec2u(newSeed);
      } else {
        updateCpuSeed(newSeed);
      }
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
  const gpuSeed = tgpu.privateVar(d.u32);
  let cpuSeed = d.u32() | 0;

  function updateCpuSeed(seed: number) {
    cpuSeed = seed | 0;
  }

  const multiplier = 0x19660d;
  const increment = 0x3c6ef35f;

  return {
    seed: tgpu.fn([d.f32])((value) => {
      const scrambled = scrambleSeed(value);
      const newSeed = hash(scrambled) ^ hash(rotl(scrambled, 16));

      if (std.isBeingTranspiled()) {
        gpuSeed.$ = newSeed;
      } else {
        updateCpuSeed(newSeed);
      }
    }),

    seed2: tgpu.fn([d.vec2f])((value) => {
      const scrambled = scrambleSeed2(value);
      const newSeed = hash(scrambled.x ^ scrambled.y) ^ hash(rotl(scrambled.x, 16) ^ scrambled.y);

      if (std.isBeingTranspiled()) {
        gpuSeed.$ = newSeed;
      } else {
        updateCpuSeed(newSeed);
      }
    }),

    seed3: tgpu.fn([d.vec3f])((value) => {
      const scrambled = scrambleSeed3(value);
      const newSeed =
        hash(scrambled.x ^ rotl(scrambled.z, 16)) ^ hash(rotl(scrambled.y, 16) ^ scrambled.z);

      if (std.isBeingTranspiled()) {
        gpuSeed.$ = newSeed;
      } else {
        updateCpuSeed(newSeed);
      }
    }),

    seed4: tgpu.fn([d.vec4f])((value) => {
      const scrambled = scrambleSeed4(value);
      const newSeed =
        hash(scrambled.x ^ rotl(scrambled.z, 16) ^ rotl(scrambled.w, 8)) ^
        hash(rotl(scrambled.y, 16) ^ scrambled.z ^ scrambled.w);

      if (std.isBeingTranspiled()) {
        gpuSeed.$ = newSeed;
      } else {
        updateCpuSeed(newSeed);
      }
    }),

    sample: randomGeneratorShell(() => {
      'use gpu';
      if (std.isBeingTranspiled()) {
        gpuSeed.$ = multiplier * gpuSeed.$ + increment; // % 2 ^ 32;
        return u32To01F32(gpuSeed.$);
      } else {
        // oxlint-disable-next-line typegpu/no-math
        updateCpuSeed(Math.imul(multiplier, cpuSeed) + increment);
        return u32To01F32(cpuSeed);
      }
    }).$name('sample'),
  };
})();

// The default (Can change between releases to improve uniformity).
export const DefaultGenerator: StatefulGenerator = BPETER;

export const randomGeneratorSlot: TgpuSlot<StatefulGenerator> = tgpu.slot(DefaultGenerator);
