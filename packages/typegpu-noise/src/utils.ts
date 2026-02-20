import tgpu, { d } from 'typegpu';

export type Prettify<T> =
  & {
    [K in keyof T]: T[K];
  }
  & {};

export type PrefixKeys<Prefix extends string, T> = {
  [K in keyof T as K extends string ? `${Prefix}${K}` : K]: T[K];
};

function quinticInterpolationImpl<T extends d.v2f | d.v3f>(t: T): T {
  'use gpu';
  return t * t * t * (t * (t * 6 - 15) + 10) as T;
}

/**
 * Works as a replacement for smoothstep, but with a continuous
 * second derivative, which in e.g. smooth normals
 */
export const quinticInterpolation2 = tgpu
  .fn([d.vec2f], d.vec2f)(quinticInterpolationImpl);

/**
 * Works as a replacement for smoothstep, but with a continuous
 * second derivative, which in e.g. smooth normals
 */
export const quinticInterpolation3 = tgpu
  .fn([d.vec3f], d.vec3f)(quinticInterpolationImpl);

const quinticDerivativeImpl = <T extends d.v2f | d.v3f>(t: T): T => {
  'use gpu';
  return (30 * t * t * (t * (t - 2)) + 1) as T;
};

/**
 * Derivative of {@link quinticInterpolation2}
 */
export const quinticDerivative2 = tgpu
  .fn([d.vec2f], d.vec2f)(quinticDerivativeImpl);

/**
 * Derivative of {@link quinticInterpolation3}
 */
export const quinticDerivative3 = tgpu
  .fn([d.vec3f], d.vec3f)(quinticDerivativeImpl);
