import * as d from 'typegpu/data';
import { add, cos, dot, normalize, sin } from 'typegpu/std';
import type { Line3 } from './schemas.ts';

export const projectPointOnLine = (point: d.v3f, line: Line3): d.v3f => {
  'use gpu';
  const pointVector = point.sub(line.origin);
  const projection = dot(pointVector, line.dir);
  return line.origin.add(line.dir.mul(projection));
};

type PosAndNormal = d.Infer<typeof PosAndNormal>;
export const PosAndNormal = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
});

export const applySinWave = (
  index: number,
  vertex: PosAndNormal,
  time: number,
) => {
  'use gpu';
  const a = -60.1;
  const b = 0.8;
  const c = 6.1;
  // z += sin(index + (time / a + x) / b) / c

  const posMod = d.vec3f();
  posMod.z = sin(d.f32(index) + (time / a + vertex.position.x) / b) / c;

  const coeff = cos(d.f32(index) + (time / a + vertex.position.x) / b) / c;
  const newOX = normalize(d.vec3f(1, 0, coeff));
  const newOZ = d.vec3f(-newOX.z, 0, newOX.x);
  const newNormalXZ = add(
    newOX.mul(vertex.normal.x),
    newOZ.mul(vertex.normal.z),
  );

  const wavedNormal = d.vec3f(newNormalXZ.x, vertex.normal.y, newNormalXZ.z);
  const wavedPosition = vertex.position.add(posMod);

  return PosAndNormal({
    position: wavedPosition,
    normal: wavedNormal,
  });
};
