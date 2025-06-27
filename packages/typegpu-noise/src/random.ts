import tgpu, { type TgpuFn } from 'typegpu';
import * as d from 'typegpu/data';
import { cos, dot, mul, sign, sin, sqrt } from 'typegpu/std';
import { randomGeneratorSlot } from './generator.ts';

const TWO_PI = Math.PI * 2;

export const randSeed: TgpuFn<(seed: d.F32) => d.Void> = tgpu
  .fn([d.f32])((seed) => {
    randomGeneratorSlot.value.seed(seed);
  });

export const randSeed2: TgpuFn<(seed: d.Vec2f) => d.Void> = tgpu
  .fn([d.vec2f])((seed) => {
    randomGeneratorSlot.value.seed2(seed);
  });

export const randSeed3: TgpuFn<(seed: d.Vec3f) => d.Void> = tgpu
  .fn([d.vec3f])((seed) => {
    randomGeneratorSlot.value.seed3(seed);
  });

export const randSeed4: TgpuFn<(seed: d.Vec4f) => d.Void> = tgpu
  .fn([d.vec4f])((seed) => {
    randomGeneratorSlot.value.seed4(seed);
  });

export const randFloat01: TgpuFn<() => d.F32> = tgpu
  .fn([], d.f32)(() => randomGeneratorSlot.value.sample());

export const randInUnitCube: TgpuFn<() => d.Vec3f> = tgpu
  .fn([], d.vec3f)(() =>
    d.vec3f(
      randomGeneratorSlot.value.sample() * 2 - 1,
      randomGeneratorSlot.value.sample() * 2 - 1,
      randomGeneratorSlot.value.sample() * 2 - 1,
    )
  );

export const randInUnitCircle: TgpuFn<() => d.Vec2f> = tgpu
  .fn([], d.vec2f)(() => {
    const radius = sqrt(randomGeneratorSlot.value.sample());
    const angle = randomGeneratorSlot.value.sample() * TWO_PI;

    return d.vec2f(cos(angle) * radius, sin(angle) * radius);
  });

export const randOnUnitCircle: TgpuFn<() => d.Vec2f> = tgpu
  .fn([], d.vec2f)(() => {
    const angle = randomGeneratorSlot.value.sample() * TWO_PI;
    return d.vec2f(cos(angle), sin(angle));
  });

export const randOnUnitSphere: TgpuFn<() => d.Vec3f> = tgpu
  .fn([], d.vec3f)(() => {
    const z = 2 * randomGeneratorSlot.value.sample() - 1;
    const oneMinusZSq = sqrt(1 - z * z);
    // TODO: Work out if the -Math.PI offset is necessary
    const theta = TWO_PI * randomGeneratorSlot.value.sample() - Math.PI;
    const x = sin(theta) * oneMinusZSq;
    const y = cos(theta) * oneMinusZSq;
    return d.vec3f(x, y, z);
  });

export const randOnUnitHemisphere: TgpuFn<(normal: d.Vec3f) => d.Vec3f> = tgpu
  .fn([d.vec3f], d.vec3f)((normal) => {
    const value = randOnUnitSphere();
    const alignment = dot(normal, value);

    return mul(sign(alignment), value);
  });
