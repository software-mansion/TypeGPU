import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import type { Line3 } from './schemas.ts';

export const projectPointOnLine = (point: d.v3f, line: Line3): d.v3f => {
  'kernel';
  const pointVector = std.sub(point, line.origin);
  const projection = std.dot(pointVector, line.dir);
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
): PosAndNormal => {
  'kernel';
  const a = -60.1;
  const b = 0.8;
  const c = 6.1;
  // z += sin(index + (time / a + x) / b) / c

  const positionModification = d.vec3f();
  positionModification.z =
    std.sin(d.f32(index) + (time / a + vertex.position.x) / b) / c;

  const coeff = std.cos(d.f32(index) + (time / a + vertex.position.x) / b) /
    c;
  const newOX = std.normalize(d.vec3f(1, 0, coeff));
  const newOZ = d.vec3f(-newOX.z, 0, newOX.x);
  const newNormalXZ = std.add(
    std.mul(vertex.normal.x, newOX),
    std.mul(vertex.normal.z, newOZ),
  );

  const wavedNormal = d.vec3f(newNormalXZ.x, vertex.normal.y, newNormalXZ.z);
  const wavedPosition = std.add(vertex.position, positionModification);

  return PosAndNormal({
    position: wavedPosition,
    normal: wavedNormal,
  });
};
