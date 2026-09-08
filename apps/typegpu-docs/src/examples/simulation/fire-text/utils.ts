import { d, std } from 'typegpu';

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
