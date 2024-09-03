import {
  type VecKind,
  vec2f,
  vec2i,
  vec2u,
  vec3f,
  vec3i,
  vec3u,
  vec4f,
  vec4i,
  vec4u,
  type vecBase,
} from './vector';

const lengthVec2 = (v: vec2f | vec2i | vec2u) => Math.sqrt(v.x ** 2 + v.y ** 2);
const lengthVec3 = (v: vec3f | vec3i | vec3u) =>
  Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
const lengthVec4 = (v: vec4f | vec4i | vec4u) =>
  Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2 + v.w ** 2);

export const VectorOps = {
  length: {
    vec2f: lengthVec2,
    vec2i: lengthVec2,
    vec2u: lengthVec2,
    vec3f: lengthVec3,
    vec3i: lengthVec3,
    vec3u: lengthVec3,
    vec4f: lengthVec4,
    vec4i: lengthVec4,
    vec4u: lengthVec4,
  } as Record<VecKind, (v: vecBase) => number>,

  add: {
    vec2f: (a: vec2f, b: vec2f) => vec2f(a.x + b.x, a.y + b.y),
    vec2i: (a: vec2i, b: vec2i) => vec2i(a.x + b.x, a.y + b.y),
    vec2u: (a: vec2u, b: vec2u) => vec2u(a.x + b.x, a.y + b.y),

    vec3f: (a: vec3f, b: vec3f) => vec3f(a.x + b.x, a.y + b.y, a.z + b.z),
    vec3i: (a: vec3i, b: vec3i) => vec3i(a.x + b.x, a.y + b.y, a.z + b.z),
    vec3u: (a: vec3u, b: vec3u) => vec3u(a.x + b.x, a.y + b.y, a.z + b.z),

    vec4f: (a: vec4f, b: vec4f) =>
      vec4f(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
    vec4i: (a: vec4i, b: vec4i) =>
      vec4i(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
    vec4u: (a: vec4u, b: vec4u) =>
      vec4u(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
  } as Record<VecKind, <T extends vecBase>(lhs: T, rhs: T) => T>,

  sub: {
    vec2f: (a: vec2f, b: vec2f) => vec2f(a.x - b.x, a.y - b.y),
    vec2i: (a: vec2i, b: vec2i) => vec2i(a.x - b.x, a.y - b.y),
    vec2u: (a: vec2u, b: vec2u) => vec2u(a.x - b.x, a.y - b.y),

    vec3f: (a: vec3f, b: vec3f) => vec3f(a.x - b.x, a.y - b.y, a.z - b.z),
    vec3i: (a: vec3i, b: vec3i) => vec3i(a.x - b.x, a.y - b.y, a.z - b.z),
    vec3u: (a: vec3u, b: vec3u) => vec3u(a.x - b.x, a.y - b.y, a.z - b.z),

    vec4f: (a: vec4f, b: vec4f) =>
      vec4f(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    vec4i: (a: vec4i, b: vec4i) =>
      vec4i(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    vec4u: (a: vec4u, b: vec4u) =>
      vec4u(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
  } as Record<VecKind, <T extends vecBase>(lhs: T, rhs: T) => T>,

  mul: {
    vec2f: (s: number, v: vec2f) => vec2f(s * v.x, s * v.y),
    vec2i: (s: number, v: vec2i) => vec2i(s * v.x, s * v.y),
    vec2u: (s: number, v: vec2u) => vec2u(s * v.x, s * v.y),

    vec3f: (s: number, v: vec3f) => vec3f(s * v.x, s * v.y, s * v.z),
    vec3i: (s: number, v: vec3i) => vec3i(s * v.x, s * v.y, s * v.z),
    vec3u: (s: number, v: vec3u) => vec3u(s * v.x, s * v.y, s * v.z),

    vec4f: (s: number, v: vec4f) => vec4f(s * v.x, s * v.y, s * v.z, s * v.w),
    vec4i: (s: number, v: vec4i) => vec4i(s * v.x, s * v.y, s * v.z, s * v.w),
    vec4u: (s: number, v: vec4u) => vec4u(s * v.x, s * v.y, s * v.z, s * v.w),
  } as Record<VecKind, <T extends vecBase>(s: number, v: T) => T>,

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
  } as Record<VecKind, <T extends vecBase>(lhs: T, rhs: T) => number>,

  normalize: {
    vec2f: (v: vec2f) => {
      const len = lengthVec2(v);
      return vec2f(v.x / len, v.y / len);
    },
    vec2i: (v: vec2i) => {
      const len = lengthVec2(v);
      return vec2i(v.x / len, v.y / len);
    },
    vec2u: (v: vec2u) => {
      const len = lengthVec2(v);
      return vec2u(v.x / len, v.y / len);
    },

    vec3f: (v: vec3f) => {
      const len = lengthVec3(v);
      return vec3f(v.x / len, v.y / len, v.z / len);
    },
    vec3i: (v: vec3i) => {
      const len = lengthVec3(v);
      return vec3i(v.x / len, v.y / len, v.z / len);
    },
    vec3u: (v: vec3u) => {
      const len = lengthVec3(v);
      return vec3u(v.x / len, v.y / len, v.z / len);
    },

    vec4f: (v: vec4f) => {
      const len = lengthVec4(v);
      return vec4f(v.x / len, v.y / len, v.z / len, v.w / len);
    },
    vec4i: (v: vec4i) => {
      const len = lengthVec4(v);
      return vec4i(v.x / len, v.y / len, v.z / len, v.w / len);
    },
    vec4u: (v: vec4u) => {
      const len = lengthVec4(v);
      return vec4u(v.x / len, v.y / len, v.z / len, v.w / len);
    },
  } as Record<VecKind, <T extends vecBase>(v: T) => T>,

  cross: {
    vec3f: (a: vec3f, b: vec3f) => {
      return vec3f(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
    vec3i: (a: vec3i, b: vec3i) => {
      return vec3i(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
    vec3u: (a: vec3u, b: vec3u) => {
      return vec3u(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
  } as Record<
    'vec3f' | 'vec3i' | 'vec3u',
    <T extends vec3f | vec3i | vec3u>(a: T, b: T) => T
  >,
};
