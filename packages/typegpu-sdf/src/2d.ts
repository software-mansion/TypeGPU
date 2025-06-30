import tgpu from 'typegpu';
import { f32, vec2f } from 'typegpu/data';
import { abs, add, length, max, min, sub } from 'typegpu/std';

export const sdDisk = tgpu.fn([vec2f, f32], f32)((p, r) => {
  'kernel & js';
  return length(p) - r;
});

export const sdBox = tgpu.fn([vec2f, vec2f], f32)((p, b) => {
  'kernel & js';
  const d = sub(abs(p), b);
  return length(max(d, vec2f(0))) + min(max(d.x, d.y), f32(0));
});

export const sdRoundedBox = tgpu.fn([vec2f, vec2f, f32], f32)((p, b, r) => {
  'kernel & js';
  const d = add(sub(abs(p), b), vec2f(r));
  return length(max(d, vec2f(0))) + min(max(d.x, d.y), f32(0)) - r;
});
