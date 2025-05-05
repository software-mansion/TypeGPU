import tgpu, { type TgpuFn } from 'typegpu';
import {
  type F32,
  f32,
  type Vec2f,
  vec2f,
  type Vec3f,
  vec3f,
  type Vec4f,
  vec4f,
} from 'typegpu/data';
import { cos, dot, mul, sign, sin, sqrt } from 'typegpu/std';
import { randomGeneratorSlot } from './generator.ts';

const TWO_PI = Math.PI * 2;

export const randSeed: TgpuFn<[F32], undefined> = tgpu['~unstable'].fn([f32])(
  (seed) => {
    randomGeneratorSlot.value.seed(seed);
  },
);

export const randSeed2: TgpuFn<[Vec2f], undefined> = tgpu['~unstable'].fn([
  vec2f,
])((seed) => {
  randomGeneratorSlot.value.seed2(seed);
});

export const randSeed3: TgpuFn<[Vec3f], undefined> = tgpu['~unstable'].fn([
  vec3f,
])((seed) => {
  randomGeneratorSlot.value.seed3(seed);
});

export const randSeed4: TgpuFn<[Vec4f], undefined> = tgpu['~unstable'].fn([
  vec4f,
])((seed) => {
  randomGeneratorSlot.value.seed4(seed);
});

export const randFloat01: TgpuFn<[], F32> = tgpu['~unstable'].fn(
  [],
  f32,
)(() => randomGeneratorSlot.value.sample());

export const randInUnitCube: TgpuFn<[], Vec3f> = tgpu['~unstable'].fn(
  [],
  vec3f,
)(() =>
  vec3f(
    randomGeneratorSlot.value.sample() * 2 - 1,
    randomGeneratorSlot.value.sample() * 2 - 1,
    randomGeneratorSlot.value.sample() * 2 - 1,
  )
);

export const randInUnitCircle: TgpuFn<[], Vec2f> = tgpu['~unstable'].fn(
  [],
  vec2f,
)(() => {
  const radius = sqrt(randomGeneratorSlot.value.sample());
  const angle = randomGeneratorSlot.value.sample() * TWO_PI;

  return vec2f(cos(angle) * radius, sin(angle) * radius);
});

export const randOnUnitSphere: TgpuFn<[], Vec3f> = tgpu['~unstable'].fn(
  [],
  vec3f,
)(() => {
  const z = 2 * randomGeneratorSlot.value.sample() - 1;
  const oneMinusZSq = sqrt(1 - z * z);
  // TODO: Work out if the -Math.PI offset is necessary
  const theta = TWO_PI * randomGeneratorSlot.value.sample() - Math.PI;
  const x = sin(theta) * oneMinusZSq;
  const y = cos(theta) * oneMinusZSq;
  return vec3f(x, y, z);
});

export const randOnUnitHemisphere: TgpuFn<[normal: Vec3f], Vec3f> = tgpu[
  '~unstable'
].fn(
  [vec3f],
  vec3f,
)((normal) => {
  const value = randOnUnitSphere();
  const alignment = dot(normal, value);

  return mul(sign(alignment), value);
});
