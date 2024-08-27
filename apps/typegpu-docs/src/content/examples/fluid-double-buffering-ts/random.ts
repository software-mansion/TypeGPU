import { f32, vec2f } from 'typegpu/data';
import { cos, dot, fract } from 'typegpu/std';

const randSeedVar = tgpu.var(vec2f).$private();

export const setupRandomSeed = tgpu.fn([vec2f]).impl(
  (coord: vec2f) => {
    randSeedVar.value = coord;
  },
  { randSeedVar },
);

/**
 * Yoinked from https://www.cg.tuwien.ac.at/research/publications/2023/PETER-2023-PSW/PETER-2023-PSW-.pdf
 * "Particle System in WebGPU" by Benedikt Peter
 */
export const rand01 = tgpu.fn([], f32).impl(() => {
  const seed = randSeedVar.value;
  seed.x = fract(cos(dot(seed, vec2f(23.14077926, 232.61690225))) * 136.8168);
  seed.y = fract(cos(dot(seed, vec2f(54.47856553, 345.84153136))) * 534.7645);

  return seed.y;
});
