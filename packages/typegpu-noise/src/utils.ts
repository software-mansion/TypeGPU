import type { d } from 'typegpu';

export type Prettify<T> =
  & {
    [K in keyof T]: T[K];
  }
  & {};

export type PrefixKeys<Prefix extends string, T> = {
  [K in keyof T as K extends string ? `${Prefix}${K}` : K]: T[K];
};

/**
 * Works as a replacement for smoothstep, but with a continuous
 * second derivative, which in e.g. smooth normals
 */
export function quinticInterpolation(t: d.v2f): d.v2f;
export function quinticInterpolation(t: d.v3f): d.v3f;
export function quinticInterpolation(t: d.vecBase): d.vecBase {
  'use gpu';
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Derivative of {@link quinticInterpolation}
 */
export function quinticDerivative(t: d.v2f): d.v2f;
export function quinticDerivative(t: d.v3f): d.v3f;
export function quinticDerivative(t: d.vecBase): d.vecBase {
  'use gpu';
  return 30 * t * t * ((t * (t - 2)) + 1);
}
