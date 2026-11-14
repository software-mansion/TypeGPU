import { d } from 'typegpu';
import { precompile } from '@typegpu/prune';

export const schemas = precompile(() => ({
  Particle: d.struct({
    position: d.vec3f,
    mass: d.f32,
    ids: d.arrayOf(d.u32, 3),
    transform: d.mat3x3f,
    flags: d.vec2i,
  }),
  count: 3,
  name: 'particles',
}));
