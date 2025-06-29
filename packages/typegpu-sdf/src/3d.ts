import tgpu from 'typegpu';
import { f32, vec3f } from 'typegpu/data';
import { abs, add, length, max, min, sub } from 'typegpu/std';

export const sdSphere = tgpu['~unstable']
  .fn([vec3f, f32], f32)((p, r) => {
    'kernel & js';
    return length(p) - r;
  });

export const sdBox = tgpu['~unstable']
  .fn([vec3f, vec3f], f32)((p, b) => {
    'kernel & js';
    const d = sub(abs(p), b);
    return length(max(d, vec3f(0))) + min(max(max(d.x, d.y), d.z), 0);
  });

export const sdRoundedBox = tgpu['~unstable']
  .fn([vec3f, vec3f, f32], f32)((p, b, r) => {
    'kernel & js';
    const d = add(sub(abs(p), b), vec3f(r));
    return length(max(d, vec3f(0))) + min(max(max(d.x, d.y), d.z), 0) - r;
  });
