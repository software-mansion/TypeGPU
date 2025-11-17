import { d, std } from 'typegpu';

export const palette = (t: number): d.v3f => {
  'use gpu';
  const a = d.vec3f(0.5, 0.59, 0.85);
  const b = d.vec3f(0.18, 0.42, 0.4);
  const c = d.vec3f(0.18, 0.48, 0.41);
  const e = d.vec3f(0.35, 0.13, 0.32);

  const expr = std.cos(std.mul(6.28318, c.mul(t).add(e)));
  return a.add(b.mul(expr));
};
