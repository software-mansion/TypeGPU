import type {
  VecKind,
  vec2f,
  vec2i,
  vec2u,
  vec3f,
  vec3i,
  vec3u,
  vec4f,
  vec4i,
  vec4u,
  vecBase,
} from './vector';

export const VectorOps = {
  length: {
    vec2f: (v: vec2f) => Math.sqrt(v.x ** 2 + v.y ** 2),
    vec2i: (v: vec2i) => Math.sqrt(v.x ** 2 + v.y ** 2),
    vec2u: (v: vec2u) => Math.sqrt(v.x ** 2 + v.y ** 2),
    vec3f: (v: vec3f) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2),
    vec3i: (v: vec3i) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2),
    vec3u: (v: vec3u) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2),
    vec4f: (v: vec4f) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2 + v.w ** 2),
    vec4i: (v: vec4i) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2 + v.w ** 2),
    vec4u: (v: vec4u) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2 + v.w ** 2),
  } as Record<VecKind, (v: vecBase) => number>,

  dot: {
    vec2f: (lhs: vec2f, rhs: vec2f) => lhs.x * rhs.x + lhs.y * rhs.y,
    vec2i: (lhs: vec2i, rhs: vec2i) => lhs.x * rhs.x + lhs.y * rhs.y,
    vec2u: (lhs: vec2u, rhs: vec2u) => lhs.x * rhs.x + lhs.y * rhs.y,
    vec3f: (lhs: vec3f, rhs: vec3f) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z,
    vec3i: (lhs: vec3i, rhs: vec3i) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z,
    vec3u: (lhs: vec3u, rhs: vec3u) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z,
    vec4f: (lhs: vec4f, rhs: vec4f) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w,
    vec4i: (lhs: vec4i, rhs: vec4i) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w,
    vec4u: (lhs: vec4u, rhs: vec4u) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w,
  } as Record<VecKind, (lhs: vecBase, rhs: vecBase) => number>,
};
