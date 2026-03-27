import tgpu from 'typegpu';
import { vec3f } from 'typegpu/data';
import { gt, pow, select } from 'typegpu/std';

export const linearToSrgb = tgpu.fn(
  [vec3f],
  vec3f,
)((linear) => {
  'use gpu';
  return select(
    12.92 * linear,
    1.055 * pow(linear, vec3f(1.0 / 2.4)) - vec3f(0.055),
    gt(linear, vec3f(0.0031308)),
  );
});

export const srgbToLinear = tgpu.fn(
  [vec3f],
  vec3f,
)((rgb) => {
  'use gpu';
  return select(
    rgb / 12.92,
    pow((rgb + vec3f(0.055)) / (1 + 0.055), vec3f(2.4)),
    gt(rgb, vec3f(0.04045)),
  );
});
