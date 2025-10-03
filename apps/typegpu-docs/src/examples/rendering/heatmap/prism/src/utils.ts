import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';

import type * as s from './structures.ts';

export function createTransformMatrix(
  translation: d.v3f,
  scale: d.v3f,
): d.Infer<typeof s.Transform> {
  return {
    model: m.mat4.scale(
      m.mat4.translate(m.mat4.identity(d.mat4x4f()), translation, d.mat4x4f()),
      scale,
      d.mat4x4f(),
    ),
  };
}
