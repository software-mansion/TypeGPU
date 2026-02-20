import tgpu, { d } from 'typegpu';
import { dot, floor, fract } from 'typegpu/std';
import { randOnUnitCircle, randSeed2 } from '../random.ts';
import { quinticDerivative2, quinticInterpolation2 } from '../utils.ts';

export const computeJunctionGradient = tgpu.fn([d.vec2i], d.vec2f)((pos) => {
  'use gpu';
  randSeed2(0.001 * d.vec2f(pos));
  return randOnUnitCircle();
});

export const getJunctionGradientSlot = tgpu.slot(computeJunctionGradient);

/**
 * Returns value of Perlin Noise at point `pos`
 */
export const sample = tgpu.fn([d.vec2f], d.f32)((pos) => {
  'use gpu';
  // Reference: https://iquilezles.org/articles/gradientnoise/

  const i = d.vec2i(floor(pos));
  const f = fract(pos);

  const u = quinticInterpolation2(f);

  const ga = getJunctionGradientSlot.$(i);
  const gb = getJunctionGradientSlot.$(i + d.vec2i(1, 0));
  const gc = getJunctionGradientSlot.$(i + d.vec2i(0, 1));
  const gd = getJunctionGradientSlot.$(i + d.vec2i(1, 1));

  const va = dot(ga, f - d.vec2f(0, 0));
  const vb = dot(gb, f - d.vec2f(1, 0));
  const vc = dot(gc, f - d.vec2f(0, 1));
  const vd = dot(gd, f - d.vec2f(1, 1));

  const noise = va + u.x * (vb - va) + u.y * (vc - va) +
    u.x * u.y * (va - vb - vc + vd);

  return noise;
});

/**
 * Returns value of Perlin Noise at point `pos` as the x coordinate, and
 * the gradient of the function at that point as yz coordinates.
 */
export const sampleWithGradient = tgpu.fn([d.vec2f], d.vec3f)((pos) => {
  'use gpu';
  // Reference: https://iquilezles.org/articles/gradientnoise/

  const i = d.vec2i(floor(pos));
  const f = fract(pos);

  const u = quinticInterpolation2(f);
  const du = quinticDerivative2(f);

  const ga = getJunctionGradientSlot.$(i);
  const gb = getJunctionGradientSlot.$(i + d.vec2i(1, 0));
  const gc = getJunctionGradientSlot.$(i + d.vec2i(0, 1));
  const gd = getJunctionGradientSlot.$(i + d.vec2i(1, 1));

  const va = dot(ga, f - d.vec2f(0, 0));
  const vb = dot(gb, f - d.vec2f(1, 0));
  const vc = dot(gc, f - d.vec2f(0, 1));
  const vd = dot(gd, f - d.vec2f(1, 1));

  const noise = va + u.x * (vb - va) + u.y * (vc - va) +
    u.x * u.y * (va - vb - vc + vd);

  const grad = ga + u.x * (gb - ga) + u.y * (gc - ga) +
    u.x * u.y * (ga - gb - gc + gd) +
    du * (u.yx * (va - vb - vc + vd) + d.vec2f(vb, vc) - va);

  return d.vec3f(noise, grad);
});
