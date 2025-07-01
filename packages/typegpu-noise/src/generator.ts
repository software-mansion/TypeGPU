import tgpu, { type TgpuFn, type TgpuFnShell, type TgpuSlot } from 'typegpu';
import * as d from 'typegpu/data';
import { add, cos, dot, fract } from 'typegpu/std';

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

// The default (Can change between releases to improve uniformity).
export const DefaultGenerator: StatefulGenerator = BPETER;

export const randomGeneratorSlot: TgpuSlot<StatefulGenerator> = tgpu.slot(
  DefaultGenerator,
);
