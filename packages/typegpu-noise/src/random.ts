import tgpu, { type TgpuFn } from 'typegpu';
import * as d from 'typegpu/data';
import {
  clamp,
  cos,
  dot,
  log,
  mul,
  normalize,
  pow,
  sign,
  sin,
  sqrt,
  step,
  tan,
} from 'typegpu/std';
import { randomGeneratorSlot } from './generator.ts';

const TWO_PI = Math.PI * 2;
const EPS = 1e-6;

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
    const theta = TWO_PI * randomGeneratorSlot.value.sample();
    const x = cos(theta) * oneMinusZSq;
    const y = sin(theta) * oneMinusZSq;
    return d.vec3f(x, y, z);
  });

export const randInUnitSphere: TgpuFn<() => d.Vec3f> = tgpu
  .fn([], d.vec3f)(() => {
    const u = randomGeneratorSlot.value.sample();
    const v = normalize(
      d.vec3f(randNormal(0, 1), randNormal(0, 1), randNormal(0, 1)),
    );
    return v.mul(pow(u, 1 / 3));
  });

export const randOnUnitHemisphere: TgpuFn<(normal: d.Vec3f) => d.Vec3f> = tgpu
  .fn([d.vec3f], d.vec3f)((normal) => {
    const value = randOnUnitSphere();
    const alignment = dot(normal, value);

    return mul(sign(alignment), value);
  });

const randUniformExclusive: TgpuFn<() => d.F32> = tgpu.fn([], d.f32)(() => {
  return clamp(randomGeneratorSlot.value.sample(), 0 + EPS, 1 - EPS);
});

export const randNormal: TgpuFn<(mu: d.F32, sigma: d.F32) => d.F32> = tgpu.fn(
  [d.f32, d.f32],
  d.f32,
)((mu, sigma) => {
  const theta = TWO_PI * randUniformExclusive();
  const R = sqrt(-2 * log(randUniformExclusive()));
  return R * sin(theta) * sigma + mu;
});

export const randExponential: TgpuFn<(rate: d.F32) => d.F32> = tgpu.fn(
  [d.f32],
  d.f32,
)((rate) => {
  const u = randUniformExclusive();
  return (-1 / rate) * log(1 - u);
});

export const randCauchy: TgpuFn<(x0: d.F32, gamma: d.F32) => d.F32> = tgpu.fn(
  [d.f32, d.f32],
  d.f32,
)((x0, gamma) => {
  const u = randNormal(0, 1);
  return x0 + gamma * (tan(Math.PI * (u - 0.5)));
});

export const randBernoulli: TgpuFn<(p: d.F32) => d.F32> = tgpu.fn(
  [d.f32],
  d.f32,
)((p) => {
  const u = randomGeneratorSlot.value.sample();
  return step(p, u);
});
