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
import type {
  vec2f as v2f,
  vec2i as v2i,
  vec2u as v2u,
  vec3f as v3f,
  vec3i as v3i,
  vec3u as v3u,
  vec4f as v4f,
  vec4i as v4i,
  vec4u as v4u,
} from './wgslTypes';

const lengthVec2 = (v: v2f | v2i | v2u) => Math.sqrt(v.x ** 2 + v.y ** 2);
const lengthVec3 = (v: v3f | v3i | v3u) =>
  Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
const lengthVec4 = (v: v4f | v4i | v4u) =>
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
    vec2f: (a: v2f, b: v2f) => vec2f(a.x + b.x, a.y + b.y),
    vec2i: (a: v2i, b: v2i) => vec2i(a.x + b.x, a.y + b.y),
    vec2u: (a: v2u, b: v2u) => vec2u(a.x + b.x, a.y + b.y),

    vec3f: (a: v3f, b: v3f) => vec3f(a.x + b.x, a.y + b.y, a.z + b.z),
    vec3i: (a: v3i, b: v3i) => vec3i(a.x + b.x, a.y + b.y, a.z + b.z),
    vec3u: (a: v3u, b: v3u) => vec3u(a.x + b.x, a.y + b.y, a.z + b.z),

    vec4f: (a: v4f, b: v4f) =>
      vec4f(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
    vec4i: (a: v4i, b: v4i) =>
      vec4i(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
    vec4u: (a: v4u, b: v4u) =>
      vec4u(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
  } as Record<VecKind, <T extends vecBase>(lhs: T, rhs: T) => T>,

  sub: {
    vec2f: (a: v2f, b: v2f) => vec2f(a.x - b.x, a.y - b.y),
    vec2i: (a: v2i, b: v2i) => vec2i(a.x - b.x, a.y - b.y),
    vec2u: (a: v2u, b: v2u) => vec2u(a.x - b.x, a.y - b.y),

    vec3f: (a: v3f, b: v3f) => vec3f(a.x - b.x, a.y - b.y, a.z - b.z),
    vec3i: (a: v3i, b: v3i) => vec3i(a.x - b.x, a.y - b.y, a.z - b.z),
    vec3u: (a: v3u, b: v3u) => vec3u(a.x - b.x, a.y - b.y, a.z - b.z),

    vec4f: (a: v4f, b: v4f) =>
      vec4f(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    vec4i: (a: v4i, b: v4i) =>
      vec4i(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    vec4u: (a: v4u, b: v4u) =>
      vec4u(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
  } as Record<VecKind, <T extends vecBase>(lhs: T, rhs: T) => T>,

  mul: {
    vec2f: (s: number, v: v2f) => vec2f(s * v.x, s * v.y),
    vec2i: (s: number, v: v2i) => vec2i(s * v.x, s * v.y),
    vec2u: (s: number, v: v2u) => vec2u(s * v.x, s * v.y),

    vec3f: (s: number, v: v3f) => vec3f(s * v.x, s * v.y, s * v.z),
    vec3i: (s: number, v: v3i) => vec3i(s * v.x, s * v.y, s * v.z),
    vec3u: (s: number, v: v3u) => vec3u(s * v.x, s * v.y, s * v.z),

    vec4f: (s: number, v: v4f) => vec4f(s * v.x, s * v.y, s * v.z, s * v.w),
    vec4i: (s: number, v: v4i) => vec4i(s * v.x, s * v.y, s * v.z, s * v.w),
    vec4u: (s: number, v: v4u) => vec4u(s * v.x, s * v.y, s * v.z, s * v.w),
  } as Record<VecKind, <T extends vecBase>(s: number, v: T) => T>,

  dot: {
    vec2f: (lhs: v2f, rhs: v2f) => lhs.x * rhs.x + lhs.y * rhs.y,
    vec2i: (lhs: v2i, rhs: v2i) => lhs.x * rhs.x + lhs.y * rhs.y,
    vec2u: (lhs: v2u, rhs: v2u) => lhs.x * rhs.x + lhs.y * rhs.y,
    vec3f: (lhs: v3f, rhs: v3f) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z,
    vec3i: (lhs: v3i, rhs: v3i) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z,
    vec3u: (lhs: v3u, rhs: v3u) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z,
    vec4f: (lhs: v4f, rhs: v4f) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w,
    vec4i: (lhs: v4i, rhs: v4i) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w,
    vec4u: (lhs: v4u, rhs: v4u) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w,
  } as Record<VecKind, <T extends vecBase>(lhs: T, rhs: T) => number>,

  normalize: {
    vec2f: (v: v2f) => {
      const len = lengthVec2(v);
      return vec2f(v.x / len, v.y / len);
    },
    vec2i: (v: v2i) => {
      const len = lengthVec2(v);
      return vec2i(v.x / len, v.y / len);
    },
    vec2u: (v: v2u) => {
      const len = lengthVec2(v);
      return vec2u(v.x / len, v.y / len);
    },

    vec3f: (v: v3f) => {
      const len = lengthVec3(v);
      return vec3f(v.x / len, v.y / len, v.z / len);
    },
    vec3i: (v: v3i) => {
      const len = lengthVec3(v);
      return vec3i(v.x / len, v.y / len, v.z / len);
    },
    vec3u: (v: v3u) => {
      const len = lengthVec3(v);
      return vec3u(v.x / len, v.y / len, v.z / len);
    },

    vec4f: (v: v4f) => {
      const len = lengthVec4(v);
      return vec4f(v.x / len, v.y / len, v.z / len, v.w / len);
    },
    vec4i: (v: v4i) => {
      const len = lengthVec4(v);
      return vec4i(v.x / len, v.y / len, v.z / len, v.w / len);
    },
    vec4u: (v: v4u) => {
      const len = lengthVec4(v);
      return vec4u(v.x / len, v.y / len, v.z / len, v.w / len);
    },
  } as Record<VecKind, <T extends vecBase>(v: T) => T>,

  cross: {
    vec3f: (a: v3f, b: v3f) => {
      return vec3f(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
    vec3i: (a: v3i, b: v3i) => {
      return vec3i(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
    vec3u: (a: v3u, b: v3u) => {
      return vec3u(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
  } as Record<
    'vec3f' | 'vec3i' | 'vec3u',
    <T extends v3f | v3i | v3u>(a: T, b: T) => T
  >,
};
