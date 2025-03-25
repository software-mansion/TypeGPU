import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const distanceVectorFromLine = tgpu['~unstable']
  .fn([d.vec3f, d.vec3f, d.vec3f], d.vec3f)
  .does((lineStart, lineEnd, point) => {
    const lineDirection = std.normalize(std.sub(lineEnd, lineStart));
    const pointVector = std.sub(point, lineStart);
    const projection = std.dot(pointVector, lineDirection);
    const closestPoint = std.add(lineStart, std.mul(projection, lineDirection));
    return std.sub(point, closestPoint);
  })
  .$name('distance vector from line');

const ApplySinWaveReturnSchema = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
});

export const applySinWave = tgpu['~unstable']
  .fn([d.u32, d.u32, d.vec3f, d.vec3f], ApplySinWaveReturnSchema)
  .does((index, time, position, normal) => {
    const a = 50.1;
    const b = 1.2;
    const c = 5.1;
    // z += sin(index + (time / a + x) / b) / c

    const positionModification = d.vec3f(
      0,
      0,
      std.sin(d.f32(index) + (d.f32(time) / a + position.x) / b) / c,
    );

    const modelNormal = normal;
    const normalXZ = d.vec3f(modelNormal.x, 0, modelNormal.z);

    const coeff = std.cos(d.f32(index) + (d.f32(time) + position.x) / b) / c;
    const newOX = std.normalize(d.vec3f(1, 0, coeff));
    const newOZ = d.vec3f(-newOX.z, 0, newOX.x);
    const newNormalXZ = std.add(
      std.mul(newOX, d.vec3f(normalXZ.x, 0, 0)),
      std.mul(newOZ, d.vec3f(0, 0, normalXZ.z)),
    );

    const wavedNormal = std.normalize(
      d.vec3f(newNormalXZ.x, modelNormal.y, newNormalXZ.z),
    );

    const wavedPosition = std.add(position, positionModification);

    return ApplySinWaveReturnSchema({
      position: wavedPosition,
      normal: wavedNormal,
    });
  });
