import { d, std } from 'typegpu';
import type { Line3 } from './schemas.ts';

export const projectPointOnLine = (point: d.v3f, line: Line3): d.v3f => {
  'use gpu';
  const pointVector = point - line.origin;
  const projection = std.dot(pointVector, line.dir);
  return line.origin + line.dir * projection;
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
  posMod.z = std.sin(d.f32(index) + (time / a + vertex.position.x) / b) / c;

  const coeff = std.cos(d.f32(index) + (time / a + vertex.position.x) / b) / c;
  const newOX = std.normalize(d.vec3f(1, 0, coeff));
  const newOZ = d.vec3f(-newOX.z, 0, newOX.x);
  const newNormalXZ = newOX * vertex.normal.x + newOZ * vertex.normal.z;

  const wavedNormal = d.vec3f(newNormalXZ.x, vertex.normal.y, newNormalXZ.z);
  const wavedPosition = vertex.position + posMod;

  return PosAndNormal({
    position: wavedPosition,
    normal: wavedNormal,
  });
};
