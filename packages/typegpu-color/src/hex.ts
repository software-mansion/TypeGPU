import tgpu, { d } from 'typegpu';
import { rgbToOklab } from './oklab.ts';

export const hexToRgb = tgpu.comptime((hex: string | number): d.v3f => {
  const h = typeof hex === 'string' ? Number.parseInt(hex.substring(1), 16) : hex;
  return d.vec3f((h >> 16) & 0xff, (h >> 8) & 0xff, h & 0xff).div(255);
});

export const hexToRgba = tgpu.comptime((hex: string | number): d.v4f => {
  const h = typeof hex === 'string' ? Number.parseInt(hex.substring(1), 16) : hex;
  return d.vec4f((h >> 24) & 0xff, (h >> 16) & 0xff, (h >> 8) & 0xff, h & 0xff).div(255);
});

export const hexToOklab = tgpu.comptime((hex: string | number): d.v3f => {
  return rgbToOklab(hexToRgb(hex));
});
