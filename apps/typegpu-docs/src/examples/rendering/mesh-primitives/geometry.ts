import { d, std } from 'typegpu';
import { meshes } from '@typegpu/geometry';

const Paint = d.struct({ color: d.vec3f });

export function paint<V extends d.WgslStruct>(
  g: meshes.IndexedGeometry<V>,
  color: d.InferInput<d.Vec3f>,
) {
  const rgb = d.vec3f(color[0], color[1], color[2]);
  return meshes.attach(g, Paint, () => {
    'use gpu';
    return Paint({ color: rgb });
  });
}

export function place<V extends meshes.Placed>(
  g: meshes.IndexedGeometry<V>,
  at: d.InferInput<d.Vec3f>,
  color: d.InferInput<d.Vec3f>,
) {
  return paint(meshes.transform(g, std.translation4(d.vec3f(at[0], at[1], at[2]))), color);
}
