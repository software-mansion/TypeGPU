import tgpu, { type TgpuFn, type TgpuFnShell, type TgpuSlot } from 'typegpu';
import * as d from 'typegpu/data';
import { add, cos, dot, fract } from 'typegpu/std';

const U32_MAX = d.u32(4294967295);

export interface StatefulGenerator {
  seed: TgpuFn<(seed: d.F32) => d.Void>;
  seed2: TgpuFn<(seed: d.Vec2f) => d.Void>;
  seed3: TgpuFn<(seed: d.Vec3f) => d.Void>;
  seed4: TgpuFn<(seed: d.Vec4f) => d.Void>;
  sample: TgpuFn<() => d.F32>;
}

export const randomGeneratorShell: TgpuFnShell<[], d.F32> = tgpu.fn([], d.f32);

/**
 * Incorporated from https://www.cg.tuwien.ac.at/research/publications/2023/PETER-2023-PSW/PETER-2023-PSW-.pdf
 * "Particle System in WebGPU" by Benedikt Peter
 */
export const BPETER: StatefulGenerator = (() => {
  const seed = tgpu['~unstable'].privateVar(d.vec2f);

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

/** HybridTaus PRNG from:
 * https://developer.nvidia.com/gpugems/gpugems3/part-vi-gpu-computing/chapter-37-efficient-random-number-generation-and-application
 */
const TausStep = tgpu.fn(
  [d.ptrPrivate(d.u32), d.u32, d.u32, d.u32, d.u32],
  d.u32,
)(
  (z, S1, S2, S3, M) => {
    const b = ((z << S1) ^ z) >> S2;
    // biome-ignore lint/style/noParameterAssign: it is a pointer
    z = ((z & M) << S3) ^ b;
    return z;
  },
);

const LCGStep = tgpu.fn([d.ptrPrivate(d.u32), d.u32, d.u32], d.u32)(
  (z, A, C) => {
    // biome-ignore lint/style/noParameterAssign: it is a pointer
    z = A * z + C;
    return z;
  },
);

export const HybridTaus: StatefulGenerator = (() => {
  const seed = tgpu['~unstable'].privateVar(d.arrayOf(d.u32, 4));

  return {
    seed: tgpu.fn([d.f32])((value) => {
      seed.$[0] = value * U32_MAX + 128;
      seed.$[1] = value * U32_MAX + 256;
      seed.$[2] = value * U32_MAX + 512;
      seed.$[3] = value * U32_MAX + 1024;
    }),

    seed2: tgpu.fn([d.vec2f])((value) => {
      seed.$[0] = value.x * U32_MAX + 128;
      seed.$[1] = value.x * U32_MAX + 256;
      seed.$[2] = value.y * U32_MAX + 512;
      seed.$[3] = value.y * U32_MAX + 1024;
    }),

    seed3: tgpu.fn([d.vec3f])((value) => {
      seed.$[0] = value.x * U32_MAX + 128;
      seed.$[1] = value.x * U32_MAX + 256;
      seed.$[2] = value.y * U32_MAX + 512;
      seed.$[3] = value.z * U32_MAX + 1024;
    }),

    seed4: tgpu.fn([d.vec4f])((value) => {
      seed.$[0] = value.x * U32_MAX + 128;
      seed.$[1] = value.y * U32_MAX + 256;
      seed.$[2] = value.z * U32_MAX + 512;
      seed.$[3] = value.w * U32_MAX + 1024;
    }),

    sample: randomGeneratorShell(() => {
      'kernel';
      return 2.3283064e-10 *
        d.f32(
          TausStep(seed.$[0] as number, 13, 19, 12, d.u32(4294967294)) ^
            TausStep(seed.$[1] as number, 2, 25, 4, d.u32(4294967288)) ^
            TausStep(seed.$[2] as number, 3, 11, 17, d.u32(4294967280)) ^
            LCGStep(seed.$[3] as number, 1664525, 1013904223),
        );
    }),
  };
})();

// The default (Can change between releases to improve uniformity).
export const DefaultGenerator: StatefulGenerator = HybridTaus;

export const randomGeneratorSlot: TgpuSlot<StatefulGenerator> = tgpu.slot(
  DefaultGenerator,
);
