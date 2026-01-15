import tgpu, { type TgpuFn } from 'typegpu';
import * as d from 'typegpu/data';
import {
  cos,
  dot,
  log,
  mul,
  normalize,
  pow,
  select,
  sign,
  sin,
  sqrt,
  step,
  tan,
} from 'typegpu/std';
import { randomGeneratorSlot } from './generator.ts';

const TWO_PI = Math.PI * 2;
const EPS = 1e-7; // don't ever get any lower than this

const seedNotEmpty = tgpu['~unstable'].comptime(
  (seedFnName: keyof typeof randomGeneratorSlot.$) => {
    if (randomGeneratorSlot.$[seedFnName]) {
      return true;
    }
    console.warn(`Called \`randf.${seedFnName}\`, but it wasn't provided`);
    return false;
  },
);

export const randSeed = tgpu.fn([d.f32])((seed) => {
  if (seedNotEmpty('seed')) {
    // @ts-expect-error trust me
    randomGeneratorSlot.$.seed(seed);
  }
}).$name('randSeed');

export const randSeed2 = tgpu.fn([d.vec2f])((seed) => {
  if (seedNotEmpty('seed2')) {
    // @ts-expect-error trust me
    randomGeneratorSlot.$.seed2(seed);
  }
}).$name('randSeed2');

export const randSeed3 = tgpu.fn([d.vec3f])((seed) => {
  if (seedNotEmpty('seed3')) {
    // @ts-expect-error trust me
    randomGeneratorSlot.$.seed3(seed);
  }
}).$name('randSeed3');

export const randSeed4 = tgpu.fn([d.vec4f])((seed) => {
  if (seedNotEmpty('seed4')) {
    // @ts-expect-error trust me
    randomGeneratorSlot.$.seed4(seed);
  }
}).$name('randSeed4');

export const randFloat01: TgpuFn<() => d.F32> = tgpu
  .fn([], d.f32)(() => randomGeneratorSlot.$.sample());

export const randInUnitCube: TgpuFn<() => d.Vec3f> = tgpu
  .fn([], d.vec3f)(() =>
    d.vec3f(
      randomGeneratorSlot.$.sample(),
      randomGeneratorSlot.$.sample(),
      randomGeneratorSlot.$.sample(),
    )
  );

export const randOnUnitCube: TgpuFn<() => d.Vec3f> = tgpu
  .fn([], d.vec3f)(() => {
    const face = d.u32(randomGeneratorSlot.$.sample() * 6);
    const axis = face % 3;
    const result = d.vec3f();
    result[axis] = d.f32(select(0, 1, face > 2));
    result[(axis + 1) % 3] = randomGeneratorSlot.$.sample();
    result[(axis + 2) % 3] = randomGeneratorSlot.$.sample();

    return result;
  });

export const randInUnitCircle: TgpuFn<() => d.Vec2f> = tgpu
  .fn([], d.vec2f)(() => {
    const radius = sqrt(randomGeneratorSlot.$.sample());
    const angle = randomGeneratorSlot.$.sample() * TWO_PI;

    return d.vec2f(cos(angle) * radius, sin(angle) * radius);
  });

export const randOnUnitCircle: TgpuFn<() => d.Vec2f> = tgpu
  .fn([], d.vec2f)(() => {
    const angle = randomGeneratorSlot.$.sample() * TWO_PI;

    return d.vec2f(cos(angle), sin(angle));
  });

export const randInUnitSphere: TgpuFn<() => d.Vec3f> = tgpu
  .fn([], d.vec3f)(() => {
    const u = randomGeneratorSlot.$.sample();
    const v = d.vec3f(randNormal(0, 1), randNormal(0, 1), randNormal(0, 1));

    const vNorm = normalize(v);

    return vNorm.mul(pow(u, 0.33));
  });

export const randOnUnitSphere: TgpuFn<() => d.Vec3f> = tgpu
  .fn([], d.vec3f)(() => {
    const z = 2 * randomGeneratorSlot.$.sample() - 1;
    const oneMinusZSq = sqrt(1 - z * z);
    const theta = TWO_PI * randomGeneratorSlot.$.sample();
    const x = cos(theta) * oneMinusZSq;
    const y = sin(theta) * oneMinusZSq;

    return d.vec3f(x, y, z);
  });

export const randInUnitHemisphere: TgpuFn<(normal: d.Vec3f) => d.Vec3f> = tgpu
  .fn([d.vec3f], d.vec3f)((normal) => {
    const value = randInUnitSphere();
    const alignment = dot(normal, value);

    return mul(sign(alignment), value);
  });

export const randOnUnitHemisphere: TgpuFn<(normal: d.Vec3f) => d.Vec3f> = tgpu
  .fn([d.vec3f], d.vec3f)((normal) => {
    const value = randOnUnitSphere();
    const alignment = dot(normal, value);

    return mul(sign(alignment), value);
  });

export const randUniformExclusive: TgpuFn<() => d.F32> = tgpu
  .fn([], d.f32)(() => {
    // Our generator currently operates on the range [0, 1),
    // so we don't need to clamp with 1 - EPS.
    // However, let's keep it, in case we change the generator's domain in the future.
    return randomGeneratorSlot.$.sample() * (1 - 2 * EPS) + EPS;
  });

export const randNormal: TgpuFn<(mu: d.F32, sigma: d.F32) => d.F32> = tgpu
  .fn([d.f32, d.f32], d.f32)((mu, sigma) => {
    const theta = TWO_PI * randUniformExclusive();
    const R = sqrt(-2 * log(randUniformExclusive()));

    return R * sin(theta) * sigma + mu;
  });

export const randExponential: TgpuFn<(rate: d.F32) => d.F32> = tgpu
  .fn([d.f32], d.f32)((rate) => {
    const u = randUniformExclusive();
    // In theory we should take log(1 - u), but u ~ (1 - u) speaking of distributions
    return (-1 / rate) * log(u);
  });

export const randCauchy: TgpuFn<(x0: d.F32, gamma: d.F32) => d.F32> = tgpu
  .fn([d.f32, d.f32], d.f32)((x0, gamma) => {
    const u = randUniformExclusive();

    return x0 + gamma * (tan(Math.PI * (u - 0.5)));
  });

export const randBernoulli: TgpuFn<(p: d.F32) => d.F32> = tgpu
  .fn([d.f32], d.f32)((p) => {
    const u = randomGeneratorSlot.$.sample();

    return step(u, p);
  });
