import { d, std } from 'typegpu';
import { meshes } from '@typegpu/geometry';
import { paint } from './geometry.ts';
import { sceneLayout } from './shading.ts';

const surface = meshes.parametric(
  {
    at: (u, v) => {
      'use gpu';
      const time = sceneLayout.$.uniforms.time;
      const p = meshes.surfaces.sphere(u, v);
      const ripple = std.sin(p.x * 4 + time * 2) * std.sin(p.y * 3 - time) * std.sin(p.z * 5);
      return p * (0.55 + 0.15 * ripple) + d.vec3f(0, 0.55, 0);
    },
  },
  { cols: 96, rows: 64 },
);

export const blob = paint(surface, d.vec3f(0.9));
