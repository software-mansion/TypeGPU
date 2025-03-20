import tgpu, { type TgpuFn } from 'typegpu';
import {
  type F32,
  type Vec2f,
  type Vec3f,
  type Vec4f,
  f32,
  vec2f,
  vec3f,
  vec4f,
} from 'typegpu/data';
import { cos, dot, mul, sin } from 'typegpu/std';
import { randomGeneratorSlot } from './generator.js';

const TWO_PI = Math.PI * 2;

// TODO: Contribute back to typegpu/std
const sqrt = tgpu['~unstable'].fn([f32], f32).does(`(value: f32) -> f32 {
  return sqrt(value);
}`);

// TODO: Contribute back to typegpu/std
const sign = tgpu['~unstable'].fn([f32], f32).does(`(value: f32) -> f32 {
  return sign(value);
}`);

export const randSeed: TgpuFn<[Vec4f], undefined> = tgpu['~unstable']
  .fn([vec4f])
  .does((seed) => randomGeneratorSlot.value.seed(seed));

export const randFloat01: TgpuFn<[], F32> = tgpu['~unstable']
  .fn([], f32)
  .does(() => randomGeneratorSlot.value.sample());

export const randInUnitCube: TgpuFn<[], Vec3f> = tgpu['~unstable']
  .fn([], vec3f)
  .does(() =>
    vec3f(
      randomGeneratorSlot.value.sample() * 2 - 1,
      randomGeneratorSlot.value.sample() * 2 - 1,
      randomGeneratorSlot.value.sample() * 2 - 1,
    ),
  );

export const randInUnitCircle: TgpuFn<[], Vec2f> = tgpu['~unstable']
  .fn([], vec2f)
  .does(() => {
    const radius = sqrt(randomGeneratorSlot.value.sample());
    const angle = randomGeneratorSlot.value.sample() * TWO_PI;

    return vec2f(cos(angle) * radius, sin(angle) * radius);
  });

export const randOnUnitSphere: TgpuFn<[], Vec3f> = tgpu['~unstable']
  .fn([], vec3f)
  .does(() => {
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
]
  .fn([vec3f], vec3f)
  .does((normal) => {
    const value = randOnUnitSphere();
    const alignment = dot(normal, value);

    return mul(sign(alignment), value);
  });
