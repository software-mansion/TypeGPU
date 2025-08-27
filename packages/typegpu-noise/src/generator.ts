import tgpu, { type TgpuFn, type TgpuFnShell, type TgpuSlot } from 'typegpu';
import * as d from 'typegpu/data';
import { add, cos, dot, fract } from 'typegpu/std';

const I32_MAX = d.i32(2147483647);
const U32_MAX = d.u32(8388608);

export interface StatefulGenerator {
  seed: TgpuFn<(seed: d.F32) => d.Void>;
  seed2: TgpuFn<(seed: d.Vec2f) => d.Void>;
  seed3: TgpuFn<(seed: d.Vec3f) => d.Void>;
  seed4: TgpuFn<(seed: d.Vec4f) => d.Void>;
  iSeed: TgpuFn<(seed: d.U32) => d.Void>;
  iSeed2: TgpuFn<(seed: d.Vec2u) => d.Void>;
  iSeed3: TgpuFn<(seed: d.Vec3u) => d.Void>;
  iSeed4: TgpuFn<(seed: d.Vec4u) => d.Void>;
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
      seed.value = value.xy.add(d.vec2f(value.z));
    }),

    seed4: tgpu.fn([d.vec4f])((value) => {
      seed.value = add(value.xy, value.zw);
    }),

    iSeed: tgpu.fn([d.u32])((value) => {
      seed.value = d.vec2f(d.f32(value), 0).div(I32_MAX);
    }),

    iSeed2: tgpu.fn([d.vec2u])((value) => {
      seed.value = d.vec2f(value.x, value.y).div(I32_MAX);
    }),

    iSeed3: tgpu.fn([d.vec3u])((value) => {
      seed.value = d.vec2f(value.x, value.y)
        .add(d.vec2f(value.z))
        .div(I32_MAX);
    }),

    iSeed4: tgpu.fn([d.vec4u])((value) => {
      seed.value = d.vec2f(add(value.xy, value.zw)).div(I32_MAX);
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

const TausStep = tgpu.fn(
  [d.ptrPrivate(d.u32), d.u32, d.u32, d.u32, d.u32],
  d.u32,
)(
  (z, S1, S2, S3, M) => {
    const b = ((z << S1) ^ z) >> S2;
    // biome-ignore lint/style/noParameterAssign: z is a pointer
    z = ((z & M) << S3) ^ b;
    return z;
  },
);

const LCGStep = tgpu.fn([d.ptrPrivate(d.u32), d.u32, d.u32], d.u32)(
  (z, A, C) => {
    // biome-ignore lint/style/noParameterAssign: z is a pointer
    z = A * z + C;
    return z;
  },
);

/** HybridTaus PRNG from:
 * https://developer.nvidia.com/gpugems/gpugems3/part-vi-gpu-computing/chapter-37-efficient-random-number-generation-and-application
 */
export const HybridTaus: StatefulGenerator = (() => {
  const seed = tgpu['~unstable'].privateVar(d.arrayOf(d.u32, 4));

  return {
    seed: tgpu.fn([d.f32])((value) => {
      seed.$[0] = 129 + d.u32(value * U32_MAX);
      seed.$[1] = 257 + d.u32(value * U32_MAX);
      seed.$[2] = 513 + d.u32(value * U32_MAX);
      seed.$[3] = 1025 + d.u32(value * U32_MAX);
    }),

    seed2: tgpu.fn([d.vec2f])((value) => {
      seed.$[0] = 129 + d.u32(value.x * 15 + value.y * 29);
      seed.$[1] = 257 + d.u32(value.x * 15 + value.y * 29);
      seed.$[2] = 513 + d.u32(value.x * 15 + value.y * 29);
      seed.$[3] = 1025 + d.u32(value.x * 100 * value.y * 100);
    }),

    seed3: tgpu.fn([d.vec3f])((value) => {
      seed.$[0] = 129 + d.u32(value.x * U32_MAX);
      seed.$[1] = 257 + d.u32(value.y * U32_MAX);
      seed.$[2] = 513 + d.u32(value.z * U32_MAX);
      seed.$[3] = 1025;
    }),

    seed4: tgpu.fn([d.vec4f])((value) => {
      seed.$[0] = 129 + d.u32(value.x * U32_MAX);
      seed.$[1] = 257 + d.u32(value.y * U32_MAX);
      seed.$[2] = 513 + d.u32(value.z * U32_MAX);
      seed.$[3] = 1025 + d.u32(value.w * U32_MAX);
    }),

    iSeed: tgpu.fn([d.u32])((value) => {
      seed.$[0] = value;
      seed.$[1] = value;
      seed.$[2] = value;
      seed.$[3] = value;
    }),

    iSeed2: tgpu.fn([d.vec2u])((value) => {
      seed.$[0] = value.x;
      seed.$[1] = value.y;
      seed.$[2] = value.x;
      seed.$[3] = value.y;
    }),

    iSeed3: tgpu.fn([d.vec3u])((value) => {
      seed.$[0] = value.x;
      seed.$[1] = value.y;
      seed.$[2] = value.z;
      seed.$[3] = value.z;
    }),

    iSeed4: tgpu.fn([d.vec4u])((value) => {
      seed.$[0] = value.x;
      seed.$[1] = value.y;
      seed.$[2] = value.z;
      seed.$[3] = value.w;
    }),

    sample: randomGeneratorShell(() => {
      'kernel';
      return d.f32(2.3283064e-10) *
        d.f32(
          // TausStep(seed.$[0] as number, 13, 19, 12, d.u32(4294967294)) ^
          //   TausStep(seed.$[1] as number, 2, 25, 4, d.u32(4294967288)) ^
          //   TausStep(seed.$[2] as number, 3, 11, 17, d.u32(4294967280)) ^
          LCGStep(seed.$[3] as number, 1664525, 1013904223),
        );
    }),
  };
})();

// The default (Can change between releases to improve uniformity).
export const DefaultGenerator: StatefulGenerator = BPETER;

export const randomGeneratorSlot: TgpuSlot<StatefulGenerator> = tgpu.slot(
  DefaultGenerator,
);
