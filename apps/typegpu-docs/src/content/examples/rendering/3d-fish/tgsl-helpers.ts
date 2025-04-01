import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const distanceVectorFromLine = tgpu['~unstable']
  .fn(
    { lineStart: d.vec3f, lineEnd: d.vec3f, point: d.vec3f },
    d.vec3f,
  )((args) => {
    const lineDirection = std.normalize(std.sub(args.lineEnd, args.lineStart));
    const pointVector = std.sub(args.point, args.lineStart);
    const projection = std.dot(pointVector, lineDirection);
    const closestPoint = std.add(
      args.lineStart,
      std.mul(projection, lineDirection),
    );
    return std.sub(args.point, closestPoint);
  })
  .$name('distance vector from line');

const ApplySinWaveReturnSchema = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
});

export const applySinWave = tgpu['~unstable'].fn(
  [d.u32, d.u32, d.vec3f, d.vec3f],
  ApplySinWaveReturnSchema,
)((index, time, position, normal) => {
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
