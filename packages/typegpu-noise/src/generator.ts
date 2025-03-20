import tgpu, { type TgpuFnShell, type TgpuFn, type TgpuSlot } from 'typegpu';
import { type F32, type Vec4f, f32, vec2f, vec4f } from 'typegpu/data';
import { cos, dot, fract } from 'typegpu/std';

export interface StatefulGenerator {
  seed: TgpuFn<[Vec4f], undefined>;
  sample: TgpuFn<[], F32>;
}

export const randomGeneratorShell: TgpuFnShell<[], F32> = tgpu['~unstable'].fn(
  [],
  f32,
);

/**
 * Incorporated from https://www.cg.tuwien.ac.at/research/publications/2023/PETER-2023-PSW/PETER-2023-PSW-.pdf
 * "Particle System in WebGPU" by Benedikt Peter
 */
export const BPETER: StatefulGenerator = (() => {
  const seed = tgpu['~unstable'].privateVar(vec2f);

  return {
    seed: tgpu['~unstable'].fn([vec4f]).does((value) => {
      seed.value = value.xy;
    }),

    sample: randomGeneratorShell.does(() => {
      const a = dot(seed.value, vec2f(23.14077926, 232.61690225));
      const b = dot(seed.value, vec2f(54.47856553, 345.84153136));
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
