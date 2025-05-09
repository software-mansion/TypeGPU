import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const Line3 = d.struct({
  /**
   * A point on the line
   */
  origin: d.vec3f,
  /**
   * Normalized direction along the line
   */
  dir: d.vec3f,
});

export const projectPointOnLine = tgpu['~unstable'].fn(
  [d.vec3f, Line3],
  d.vec3f,
)((point, line) => {
  const pointVector = std.sub(point, line.origin);
  const projection = std.dot(pointVector, line.dir);
  const closestPoint = std.add(
    line.origin,
    std.mul(projection, line.dir),
  );
  return closestPoint;
});

const ApplySinWaveReturnSchema = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
});

export const applySinWave = tgpu['~unstable'].fn(
  { index: d.u32, time: d.u32, position: d.vec3f, normal: d.vec3f },
  ApplySinWaveReturnSchema,
)(({ index, time, position, normal }) => {
  const a = 60.1;
  const b = 0.8;
  const c = 10.1;
  // z += sin(index + (time / a + x) / b) / c

  const positionModification = d.vec3f(
    0,
    0,
    std.sin(d.f32(index) + (d.f32(time) / a + position.x) / b) / c,
  );

  const coeff = std.cos(d.f32(index) + (d.f32(time) / a + position.x) / b) / c;
  const newOX = std.normalize(d.vec3f(1, 0, coeff));
  const newOZ = d.vec3f(-newOX.z, 0, newOX.x);
  const newNormalXZ = std.add(
    std.mul(normal.x, newOX),
    std.mul(normal.z, newOZ),
  );

  const wavedNormal = d.vec3f(newNormalXZ.x, normal.y, newNormalXZ.z);
  const wavedPosition = std.add(position, positionModification);

  return ApplySinWaveReturnSchema({
    position: wavedPosition,
    normal: wavedNormal,
  });
});
