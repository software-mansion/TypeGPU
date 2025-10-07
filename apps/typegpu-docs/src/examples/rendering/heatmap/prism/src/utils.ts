import * as d from 'typegpu/data';

import type * as s from './structures.ts';

export function createTransformMatrix(
  translation: d.v3f,
  scale: d.v3f,
): d.Infer<typeof s.Transform> {
  return {
    model: d.mat4x4f.translation(translation).mul(d.mat4x4f.scaling(scale)),
  };
}
