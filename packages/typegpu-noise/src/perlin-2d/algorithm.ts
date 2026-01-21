import tgpu, { d } from 'typegpu';
import { add, dot, floor, fract, mul, sub } from 'typegpu/std';
import { randOnUnitCircle, randSeed2 } from '../random.ts';
import { quinticDerivative2, quinticInterpolation2 } from '../utils.ts';

export const computeJunctionGradient = tgpu.fn([d.vec2i], d.vec2f)((pos) => {
  randSeed2(mul(0.001, d.vec2f(pos)));
  return randOnUnitCircle();
});

export const getJunctionGradientSlot = tgpu.slot(computeJunctionGradient);

/**
 * Returns value of Perlin Noise at point `pos`
 */
export const sample = tgpu.fn([d.vec2f], d.f32)((pos) => {
  // Reference: https://iquilezles.org/articles/gradientnoise/

  const i = d.vec2i(floor(pos));
  const f = fract(pos);

  const u = quinticInterpolation2(f);

  const ga = getJunctionGradientSlot.$(i);
  const gb = getJunctionGradientSlot.$(add(i, d.vec2i(1, 0)));
  const gc = getJunctionGradientSlot.$(add(i, d.vec2i(0, 1)));
  const gd = getJunctionGradientSlot.$(add(i, d.vec2i(1, 1)));

  const va = dot(ga, sub(f, d.vec2f(0, 0)));
  const vb = dot(gb, sub(f, d.vec2f(1, 0)));
  const vc = dot(gc, sub(f, d.vec2f(0, 1)));
  const vd = dot(gd, sub(f, d.vec2f(1, 1)));

  const noise = va + u.x * (vb - va) + u.y * (vc - va) +
    u.x * u.y * (va - vb - vc + vd);

  return noise;
});

/**
 * Returns value of Perlin Noise at point `pos` as the x coordinate, and
 * the gradient of the function at that point as yz coordinates.
 */
export const sampleWithGradient = tgpu.fn([d.vec2f], d.vec3f)((pos) => {
  // Reference: https://iquilezles.org/articles/gradientnoise/

  const i = d.vec2i(floor(pos));
  const f = fract(pos);

  const u = quinticInterpolation2(f);
  const du = quinticDerivative2(f);

  const ga = getJunctionGradientSlot.$(i);
  const gb = getJunctionGradientSlot.$(add(i, d.vec2i(1, 0)));
  const gc = getJunctionGradientSlot.$(add(i, d.vec2i(0, 1)));
  const gd = getJunctionGradientSlot.$(add(i, d.vec2i(1, 1)));

  const va = dot(ga, sub(f, d.vec2f(0, 0)));
  const vb = dot(gb, sub(f, d.vec2f(1, 0)));
  const vc = dot(gc, sub(f, d.vec2f(0, 1)));
  const vd = dot(gd, sub(f, d.vec2f(1, 1)));

  const noise = va + u.x * (vb - va) + u.y * (vc - va) +
    u.x * u.y * (va - vb - vc + vd);

  // ga + u.x*(gb-ga) + u.y*(gc-ga) + u.x*u.y*(ga-gb-gc+gd) + du * (u.yx*(va-vb-vc+vd) + vec2(vb,vc) - va))
  const grad = add(
    ga,
    add(
      add(
        add(mul(u.x, sub(gb, ga)), mul(u.y, sub(gc, ga))),
        mul(u.x, mul(u.y, add(sub(sub(ga, gb), gc), gd))),
      ),
      mul(du, sub(add(mul(u.yx, va - vb - vc + vd), d.vec2f(vb, vc)), va)),
    ),
  );

  return d.vec3f(noise, grad);
});
