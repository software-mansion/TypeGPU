import { d } from 'typegpu';

export const TAU = Math.PI * 2;

export const X = d.vec3f(1, 0, 0);
export const Y = d.vec3f(0, 1, 0);
export const Z = d.vec3f(0, 0, 1);
export const NX = d.vec3f(-1, 0, 0);
export const NY = d.vec3f(0, -1, 0);
export const NZ = d.vec3f(0, 0, -1);

export function frame(tangent: d.v3f, normal: d.v3f, bitangent: d.v3f, center: d.v3f) {
  return d.mat4x4f(
    d.vec4f(tangent, 0),
    d.vec4f(normal, 0),
    d.vec4f(bitangent, 0),
    d.vec4f(center, 1),
  );
}
