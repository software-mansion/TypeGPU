import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { add, mul, pow, sub } from 'typegpu/std';

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
export const quinticInterpolation2 = tgpu.fn([d.vec2f], d.vec2f)((t) =>
  mul(
    pow(t, d.vec2f(3)),
    add(mul(t, sub(mul(t, d.vec2f(6)), d.vec2f(15))), d.vec2f(10)),
  )
);

/**
 * Works as a replacement for smoothstep, but with a continuous
 * second derivative, which in e.g. smooth normals
 */
export const quinticInterpolation3 = tgpu.fn([d.vec3f], d.vec3f)((t) =>
  mul(
    pow(t, d.vec3f(3)),
    add(mul(t, sub(mul(t, d.vec3f(6)), d.vec3f(15))), d.vec3f(10)),
  )
);

/**
 * Derivative of {@link quinticInterpolation2}
 */
export const quinticDerivative2 = tgpu.fn([d.vec2f], d.vec2f)((t) => {
  return mul(
    mul(d.vec2f(30), mul(t, t)),
    mul(t, add(sub(t, d.vec2f(2)), d.vec2f(1))),
  );
});

/**
 * Derivative of {@link quinticInterpolation3}
 */
export const quinticDerivative3 = tgpu.fn([d.vec3f], d.vec3f)((t) => {
  return mul(
    mul(d.vec3f(30), mul(t, t)),
    mul(t, add(sub(t, d.vec3f(3)), d.vec3f(1))),
  );
});
