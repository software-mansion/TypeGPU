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
