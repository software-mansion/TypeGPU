import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { pow } from 'typegpu/std';

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
 * second derivative, so lighting is continuous.
 */
export const smootherStep = tgpu.fn([d.f32], d.f32)((x) =>
  6 * pow(x, 5) - 15 * pow(x, 4) + 10 * pow(x, 3)
);
