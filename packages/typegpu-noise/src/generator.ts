import tgpu, { type TgpuFn, type TgpuFnShell, type TgpuSlot } from 'typegpu';
import * as d from 'typegpu/data';
import { add, cos, dot, fract } from 'typegpu/std';

const I32_MAX = d.u32(2147483647);
const MAX_SAFE_INTEGER_F32 = d.u32(8388608);
const VIRTUAL_DIM = d.f32(1024);

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
      seed.value = d.vec2f(d.f32(value), 0);
    }),

    iSeed2: tgpu.fn([d.vec2u])((value) => {
      seed.value = d.vec2f(value.x, value.y);
    }),

    iSeed3: tgpu.fn([d.vec3u])((value) => {
      seed.value = d.vec2f(value.x, value.y)
        .add(d.vec2f(value.z));
    }),

    iSeed4: tgpu.fn([d.vec4u])((value) => {
      seed.value = d.vec2f(add(value.xy, value.zw));
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

const floater = tgpu.fn([d.u32], d.f32)`(val){
  let exponent: u32 = 0x3f800000;
  let mantissa: u32 = 0x007fffff & val;
  var ufloat: u32 = (exponent | mantissa);
  return bitcast<f32>(ufloat) - 1f;
}`;

/** HybridTaus PRNG from:
 * https://developer.nvidia.com/gpugems/gpugems3/part-vi-gpu-computing/chapter-37-efficient-random-number-generation-and-application
 */
export const HybridTaus: StatefulGenerator = (() => {
  const seed = tgpu['~unstable'].privateVar(d.vec4u, d.vec4u(128));

  return {
    seed: tgpu.fn([d.f32])((value) => {
      seed.$.x = 128 + (d.u32(value * I32_MAX) >> 1);
      seed.$.y = 128 + (d.u32(value * I32_MAX) >> 2);
      seed.$.z = 128 + (d.u32(value * I32_MAX) << 3);
      seed.$.w = 128 + (d.u32(value * I32_MAX) << 5);
    }),

    seed2: tgpu.fn([d.vec2f])((value) => {
      seed.$[0] = 128 + d.u32(value.y * I32_MAX) >> 1;
      seed.$[1] = 128 + d.u32(value.y * I32_MAX) >> 2;
      seed.$[2] = 128 + d.u32(value.y * I32_MAX) << 3;
      seed.$[3] = 128 + d.u32(value.y * I32_MAX) << 5;
    }),

    seed3: tgpu.fn([d.vec3f])((value) => {
      seed.$[0] = 128 + d.u32(value.x * I32_MAX) >> 1;
      seed.$[1] = 128 + d.u32(value.y * I32_MAX) >> 2;
      seed.$[2] = 128 + d.u32(value.z * I32_MAX) << 3;
      seed.$[3] = 128 + d.u32(value.x * I32_MAX) << 5;
    }),

    seed4: tgpu.fn([d.vec4f])((value) => {
      seed.$[0] = 128 + d.u32(value.x * I32_MAX) >> 1;
      seed.$[1] = 128 + d.u32(value.y * I32_MAX) >> 2;
      seed.$[2] = 128 + d.u32(value.z * I32_MAX) << 3;
      seed.$[3] = 128 + d.u32(value.w * I32_MAX) << 5;
    }),

    iSeed: tgpu.fn([d.u32])((value) => {
      seed.$[0] = value;
      seed.$[1] = value;
      seed.$[2] = value;
      seed.$[3] = value;
    }),

    iSeed2: tgpu.fn([d.vec2u])((value) => {
      const id = value.x * VIRTUAL_DIM + value.y;
      seed.$[0] = id;
      seed.$[1] = id;
      seed.$[2] = id;
      seed.$[3] = id;
    }),

    iSeed3: tgpu.fn([d.vec3u])((value) => {
      const id = value.x * VIRTUAL_DIM * VIRTUAL_DIM + value.y * VIRTUAL_DIM +
        value.z;
      seed.$[0] = id;
      seed.$[1] = id;
      seed.$[2] = id;
      seed.$[3] = id;
    }),

    iSeed4: tgpu.fn([d.vec4u])((value) => {
      const id = value.x * VIRTUAL_DIM * VIRTUAL_DIM * VIRTUAL_DIM +
        value.y * VIRTUAL_DIM * VIRTUAL_DIM + value.z * VIRTUAL_DIM +
        value.w;
      seed.$[0] = id;
      seed.$[1] = id;
      seed.$[2] = id;
      seed.$[3] = id;
    }),

    sample: randomGeneratorShell(() => {
      'kernel';
      const b1 = ((seed.$.x << 13) ^ seed.$.x) >> 19;
      seed.$.x = ((seed.$.x & 4294967294) << 12) ^ b1;
      const b2 = ((seed.$.y << 2) ^ seed.$.y) >> 25;
      seed.$.y = ((seed.$.y & 4294967288) << 4) ^ b2;
      const b3 = ((seed.$.z << 3) ^ seed.$.z) >> 11;
      seed.$.z = ((seed.$.z & 4294967280) << 17) ^ b3;
      const s = seed.$.x ^ seed.$.y ^ seed.$.z;

      return floater(s);
    }),
  };
})();

// The default (Can change between releases to improve uniformity).
export const DefaultGenerator: StatefulGenerator = BPETER;

export const randomGeneratorSlot: TgpuSlot<StatefulGenerator> = tgpu.slot(
  DefaultGenerator,
);
