import { sdLine } from '@typegpu/sdf';
import { d, std } from 'typegpu';

export const brushDistance = (pos: d.v2f, start: d.v2f, end: d.v2f) => {
  'use gpu';
  if (std.allEq(start, end)) {
    return std.distance(pos, start);
  }
  return sdLine(pos, start, end);
};

export const brushFalloff = (dist: number, radius: number, isSoft: number, inner: number) => {
  'use gpu';
  if (dist > radius) {
    return d.f32(0);
  }
  if (isSoft === 1) {
    return d.f32(1) - std.smoothstep(radius * inner, radius, dist);
  }
  return d.f32(1);
};

export const textureWidth = (tex: d.texture2d<d.F32>) => {
  'use gpu';
  return d.f32(std.textureDimensions(tex).x);
};
