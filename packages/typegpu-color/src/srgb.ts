import tgpu from 'typegpu';
import { vec3f } from 'typegpu/data';
import { add, gt, mul, pow, select, sub } from 'typegpu/std';

export const linearToSrgb = tgpu.fn(
  [vec3f],
  vec3f,
)((linear) => {
  return select(
    mul(12.92, linear),
    sub(mul(1.055, pow(linear, vec3f(1.0 / 2.4))), vec3f(0.055)),
    gt(linear, vec3f(0.0031308)),
  );
});

export const srgbToLinear = tgpu.fn(
  [vec3f],
  vec3f,
)((rgb) => {
  return select(
    mul(1.0 / 12.92, rgb),
    pow(mul(add(rgb, vec3f(0.055)), vec3f(1 / (1 + 0.055))), vec3f(2.4)),
    gt(rgb, vec3f(0.04045)),
  );
});
