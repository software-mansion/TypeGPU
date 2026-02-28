import tgpu, { d } from 'typegpu';
import { add, mul, sub } from 'typegpu/std';

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type PrefixKeys<Prefix extends string, T> = {
  [K in keyof T as K extends string ? `${Prefix}${K}` : K]: T[K];
};

// t * t * t * (t * (6t - (15, 15)) + (10, 10));
const quinticInterpolationImpl = <T extends d.v2f | d.v3f>(t: T): T => {
  'use gpu';
  return mul(mul(t, mul(t, t)), add(mul(t, sub(mul(t, 6), 15)), 10));
  // TODO: Write it using fluent APIs when it becomes available:
  // return t.mul(t).mul(t).mul((t.mul(6).sub(15)).add(10));
};

/**
 * Works as a replacement for smoothstep, but with a continuous
 * second derivative, which in e.g. smooth normals
 */
export const quinticInterpolation2 = tgpu.fn([d.vec2f], d.vec2f)(quinticInterpolationImpl);

/**
 * Works as a replacement for smoothstep, but with a continuous
 * second derivative, which in e.g. smooth normals
 */
export const quinticInterpolation3 = tgpu.fn([d.vec3f], d.vec3f)(quinticInterpolationImpl);

// 30 * t * t * (t * (t - (2, 2)) + (1, 1))
const quinticDerivativeImpl = <T extends d.v2f | d.v3f>(t: T): T => {
  'use gpu';
  return mul(mul(mul(30, t), t), add(mul(t, sub(t, 2)), 1));
};

/**
 * Derivative of {@link quinticInterpolation2}
 */
export const quinticDerivative2 = tgpu.fn([d.vec2f], d.vec2f)(quinticDerivativeImpl);

/**
 * Derivative of {@link quinticInterpolation3}
 */
export const quinticDerivative3 = tgpu.fn([d.vec3f], d.vec3f)(quinticDerivativeImpl);
