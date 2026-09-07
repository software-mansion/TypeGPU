import { d, std } from 'typegpu';
import { meshes } from '@typegpu/geometry';

const Paint = d.struct({ color: d.vec3f });

export function paint<V extends d.WgslStruct>(g: meshes.IndexedGeometry<V>, color: d.v3f) {
  return meshes.attach(g, Paint, () => {
    'use gpu';

    return Paint({ color });
  });
}

export function place<V extends meshes.Placed>(
  g: meshes.IndexedGeometry<V>,
  at: d.v3f,
  color: d.v3f,
) {
  return paint(meshes.transform(g, std.translation4(at)), color);
}
