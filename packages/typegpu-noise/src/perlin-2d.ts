import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { add, dot, floor, mix, mul, sub } from 'typegpu/std';
import { randOnUnitCircle, randSeed2 } from './random.ts';
import { smootherStep } from './utils.ts';

export const computeJunctionGradient = tgpu.fn([d.vec2i], d.vec2f)((pos) => {
  randSeed2(mul(0.001, d.vec2f(pos)));
  return randOnUnitCircle();
});

export const getJunctionGradientSlot = tgpu.slot(
  computeJunctionGradient,
);

const dotProdGrid = tgpu.fn([d.vec2f, d.vec2i], d.f32)((pos, junction) => {
  const relative = sub(pos, d.vec2f(junction));
  const gridVector = getJunctionGradientSlot.value(junction);
  return dot(relative, gridVector);
});

export const sample = tgpu.fn([d.vec2f], d.f32)((pos) => {
  const topLeftJunction = d.vec2i(floor(pos));

  const topLeft = dotProdGrid(pos, topLeftJunction);
  const topRight = dotProdGrid(pos, add(topLeftJunction, d.vec2i(1, 0)));
  const bottomLeft = dotProdGrid(pos, add(topLeftJunction, d.vec2i(0, 1)));
  const bottomRight = dotProdGrid(pos, add(topLeftJunction, d.vec2i(1, 1)));

  const partial = sub(pos, floor(pos));
  const top = mix(topLeft, topRight, smootherStep(partial.x));
  const bottom = mix(bottomLeft, bottomRight, smootherStep(partial.x));
  return mix(top, bottom, smootherStep(partial.y));
});
