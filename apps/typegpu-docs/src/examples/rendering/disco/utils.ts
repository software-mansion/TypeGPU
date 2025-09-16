import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const palette = tgpu.fn([d.f32], d.vec3f)((t) => {
  const a = d.vec3f(0.50, 0.59, 0.85);
  const b = d.vec3f(0.18, 0.42, 0.40);
  const c = d.vec3f(0.18, 0.48, 0.41);
  const e = d.vec3f(0.35, 0.13, 0.32);

  const expr = std.cos(std.mul(6.28318, c.mul(t).add(e)));
  return a.add(b.mul(expr));
});
