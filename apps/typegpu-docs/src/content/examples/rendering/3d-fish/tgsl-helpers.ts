import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const distanceVectorFromLine = tgpu['~unstable']
  .fn(
    [d.vec3f, d.vec3f, d.vec3f],
    d.vec3f,
  )((lineStart, lineEnd, point) => {
    const lineDirection = std.normalize(std.sub(lineEnd, lineStart));
    const pointVector = std.sub(point, lineStart);
    const projection = std.dot(pointVector, lineDirection);
    const closestPoint = std.add(lineStart, std.mul(projection, lineDirection));
    return std.sub(point, closestPoint);
  })
  .$name('distance vector from line');
