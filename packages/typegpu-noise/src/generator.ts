import tgpu, { type TgpuFn, type TgpuFnShell, type TgpuSlot } from 'typegpu';
import * as d from 'typegpu/data';
import { add, cos, dot, fract } from 'typegpu/std';

export interface StatefulGenerator {
  seed: TgpuFn<[d.F32], undefined>;
  seed2: TgpuFn<[d.Vec2f], undefined>;
  seed3: TgpuFn<[d.Vec3f], undefined>;
  seed4: TgpuFn<[d.Vec4f], undefined>;
  sample: TgpuFn<[], d.F32>;
}

export const randomGeneratorShell: TgpuFnShell<[], d.F32> = tgpu[
  '~unstable'
].fn([], d.f32);

/**
 * Incorporated from https://www.cg.tuwien.ac.at/research/publications/2023/PETER-2023-PSW/PETER-2023-PSW-.pdf
 * "Particle System in WebGPU" by Benedikt Peter
 */
export const BPETER: StatefulGenerator = (() => {
  const seed = tgpu['~unstable'].privateVar(d.vec2f);

  return {
    seed: tgpu['~unstable'].fn([d.f32])((value) => {
      seed.value = d.vec2f(value, 0);
    }),

    seed2: tgpu['~unstable'].fn([d.vec2f])((value) => {
      seed.value = value;
    }),

    seed3: tgpu['~unstable'].fn([d.vec3f])((value) => {
      seed.value = add(value.xy, d.vec2f(value.z));
    }),

    seed4: tgpu['~unstable'].fn([d.vec4f])((value) => {
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

export const randomGeneratorSlot: TgpuSlot<StatefulGenerator> =
  tgpu['~unstable'].slot(DefaultGenerator);
