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
} from './vector';
import type * as wgsl from './wgslTypes';

type vBase = { kind: VecKind };

const lengthVec2 = (v: wgsl.v2f | wgsl.v2i | wgsl.v2u) =>
  Math.sqrt(v.x ** 2 + v.y ** 2);
const lengthVec3 = (v: wgsl.v3f | wgsl.v3i | wgsl.v3u) =>
  Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
const lengthVec4 = (v: wgsl.v4f | wgsl.v4i | wgsl.v4u) =>
  Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2 + v.w ** 2);

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(low, value), high);

export const VectorOps = {
  abs: {
    vec2f: (v: wgsl.v2f) => vec2f(Math.abs(v.x), Math.abs(v.y)),
    vec2i: (v: wgsl.v2i) => vec2i(Math.abs(v.x), Math.abs(v.y)),
    vec2u: (v: wgsl.v2u) => vec2u(Math.abs(v.x), Math.abs(v.y)),

    vec3f: (v: wgsl.v3f) => vec3f(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)),
    vec3i: (v: wgsl.v3i) => vec3i(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)),
    vec3u: (v: wgsl.v3u) => vec3u(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)),

    vec4f: (v: wgsl.v4f) =>
      vec4f(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z), Math.abs(v.w)),
    vec4i: (v: wgsl.v4i) =>
      vec4i(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z), Math.abs(v.w)),
    vec4u: (v: wgsl.v4u) =>
      vec4u(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z), Math.abs(v.w)),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  ceil: {
    vec2f: (v: wgsl.v2f) => vec2f(Math.ceil(v.x), Math.ceil(v.y)),
    vec2i: (v: wgsl.v2i) => vec2i(Math.ceil(v.x), Math.ceil(v.y)),
    vec2u: (v: wgsl.v2u) => vec2u(Math.ceil(v.x), Math.ceil(v.y)),

    vec3f: (v: wgsl.v3f) =>
      vec3f(Math.ceil(v.x), Math.ceil(v.y), Math.ceil(v.z)),
    vec3i: (v: wgsl.v3i) =>
      vec3i(Math.ceil(v.x), Math.ceil(v.y), Math.ceil(v.z)),
    vec3u: (v: wgsl.v3u) =>
      vec3u(Math.ceil(v.x), Math.ceil(v.y), Math.ceil(v.z)),

    vec4f: (v: wgsl.v4f) =>
      vec4f(Math.ceil(v.x), Math.ceil(v.y), Math.ceil(v.z), Math.ceil(v.w)),
    vec4i: (v: wgsl.v4i) =>
      vec4i(Math.ceil(v.x), Math.ceil(v.y), Math.ceil(v.z), Math.ceil(v.w)),
    vec4u: (v: wgsl.v4u) =>
      vec4u(Math.ceil(v.x), Math.ceil(v.y), Math.ceil(v.z), Math.ceil(v.w)),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  clamp: {
    vec2f: (v: wgsl.v2f, low: wgsl.v2f, high: wgsl.v2f) =>
      vec2f(clamp(v.x, low.x, high.x), clamp(v.y, low.y, high.y)),
    vec2i: (v: wgsl.v2i, low: wgsl.v2i, high: wgsl.v2i) =>
      vec2i(clamp(v.x, low.x, high.x), clamp(v.y, low.y, high.y)),
    vec2u: (v: wgsl.v2u, low: wgsl.v2u, high: wgsl.v2u) =>
      vec2u(clamp(v.x, low.x, high.x), clamp(v.y, low.y, high.y)),

    vec3f: (v: wgsl.v3f, low: wgsl.v3f, high: wgsl.v3f) =>
      vec3f(
        clamp(v.x, low.x, high.x),
        clamp(v.y, low.y, high.y),
        clamp(v.z, low.z, high.z),
      ),
    vec3i: (v: wgsl.v3i, low: wgsl.v3i, high: wgsl.v3f) =>
      vec3i(
        clamp(v.x, low.x, high.x),
        clamp(v.y, low.y, high.y),
        clamp(v.z, low.z, high.z),
      ),
    vec3u: (v: wgsl.v3u, low: wgsl.v3u, high: wgsl.v3f) =>
      vec3u(
        clamp(v.x, low.x, high.x),
        clamp(v.y, low.y, high.y),
        clamp(v.z, low.z, high.z),
      ),

    vec4f: (v: wgsl.v4f, low: wgsl.v4f, high: wgsl.v4f) =>
      vec4f(
        clamp(v.x, low.x, high.x),
        clamp(v.y, low.y, high.y),
        clamp(v.z, low.z, high.z),
        clamp(v.w, low.w, high.w),
      ),
    vec4i: (v: wgsl.v4i, low: wgsl.v4i, high: wgsl.v4i) =>
      vec4i(
        clamp(v.x, low.x, high.x),
        clamp(v.y, low.y, high.y),
        clamp(v.z, low.z, high.z),
        clamp(v.w, low.w, high.w),
      ),
    vec4u: (v: wgsl.v4u, low: wgsl.v4u, high: wgsl.v4u) =>
      vec4u(
        clamp(v.x, low.x, high.x),
        clamp(v.y, low.y, high.y),
        clamp(v.z, low.z, high.z),
        clamp(v.w, low.w, high.w),
      ),
  } as Record<VecKind, <T extends vBase>(v: T, low: T, high: T) => T>,

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
  } as Record<VecKind, (v: vBase) => number>,

  add: {
    vec2f: (a: wgsl.v2f, b: wgsl.v2f) => vec2f(a.x + b.x, a.y + b.y),
    vec2i: (a: wgsl.v2i, b: wgsl.v2i) => vec2i(a.x + b.x, a.y + b.y),
    vec2u: (a: wgsl.v2u, b: wgsl.v2u) => vec2u(a.x + b.x, a.y + b.y),

    vec3f: (a: wgsl.v3f, b: wgsl.v3f) => vec3f(a.x + b.x, a.y + b.y, a.z + b.z),
    vec3i: (a: wgsl.v3i, b: wgsl.v3i) => vec3i(a.x + b.x, a.y + b.y, a.z + b.z),
    vec3u: (a: wgsl.v3u, b: wgsl.v3u) => vec3u(a.x + b.x, a.y + b.y, a.z + b.z),

    vec4f: (a: wgsl.v4f, b: wgsl.v4f) =>
      vec4f(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
    vec4i: (a: wgsl.v4i, b: wgsl.v4i) =>
      vec4i(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
    vec4u: (a: wgsl.v4u, b: wgsl.v4u) =>
      vec4u(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
  } as Record<VecKind, <T extends vBase>(lhs: T, rhs: T) => T>,

  sub: {
    vec2f: (a: wgsl.v2f, b: wgsl.v2f) => vec2f(a.x - b.x, a.y - b.y),
    vec2i: (a: wgsl.v2i, b: wgsl.v2i) => vec2i(a.x - b.x, a.y - b.y),
    vec2u: (a: wgsl.v2u, b: wgsl.v2u) => vec2u(a.x - b.x, a.y - b.y),

    vec3f: (a: wgsl.v3f, b: wgsl.v3f) => vec3f(a.x - b.x, a.y - b.y, a.z - b.z),
    vec3i: (a: wgsl.v3i, b: wgsl.v3i) => vec3i(a.x - b.x, a.y - b.y, a.z - b.z),
    vec3u: (a: wgsl.v3u, b: wgsl.v3u) => vec3u(a.x - b.x, a.y - b.y, a.z - b.z),

    vec4f: (a: wgsl.v4f, b: wgsl.v4f) =>
      vec4f(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    vec4i: (a: wgsl.v4i, b: wgsl.v4i) =>
      vec4i(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    vec4u: (a: wgsl.v4u, b: wgsl.v4u) =>
      vec4u(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
  } as Record<VecKind, <T extends vBase>(lhs: T, rhs: T) => T>,

  mulSxV: {
    vec2f: (s: number, v: wgsl.v2f) => vec2f(s * v.x, s * v.y),
    vec2i: (s: number, v: wgsl.v2i) => vec2i(s * v.x, s * v.y),
    vec2u: (s: number, v: wgsl.v2u) => vec2u(s * v.x, s * v.y),

    vec3f: (s: number, v: wgsl.v3f) => vec3f(s * v.x, s * v.y, s * v.z),
    vec3i: (s: number, v: wgsl.v3i) => vec3i(s * v.x, s * v.y, s * v.z),
    vec3u: (s: number, v: wgsl.v3u) => vec3u(s * v.x, s * v.y, s * v.z),

    vec4f: (s: number, v: wgsl.v4f) =>
      vec4f(s * v.x, s * v.y, s * v.z, s * v.w),
    vec4i: (s: number, v: wgsl.v4i) =>
      vec4i(s * v.x, s * v.y, s * v.z, s * v.w),
    vec4u: (s: number, v: wgsl.v4u) =>
      vec4u(s * v.x, s * v.y, s * v.z, s * v.w),
  } as Record<VecKind, <T extends vBase>(s: number, v: T) => T>,

  mulVxV: {
    vec2f: (a: wgsl.v2f, b: wgsl.v2f) => vec2f(a.x * b.x, a.y * b.y),
    vec2i: (a: wgsl.v2i, b: wgsl.v2i) => vec2i(a.x * b.x, a.y * b.y),
    vec2u: (a: wgsl.v2u, b: wgsl.v2u) => vec2u(a.x * b.x, a.y * b.y),

    vec3f: (a: wgsl.v3f, b: wgsl.v3f) => vec3f(a.x * b.x, a.y * b.y, a.z * b.z),
    vec3i: (a: wgsl.v3i, b: wgsl.v3i) => vec3i(a.x * b.x, a.y * b.y, a.z * b.z),
    vec3u: (a: wgsl.v3u, b: wgsl.v3u) => vec3u(a.x * b.x, a.y * b.y, a.z * b.z),

    vec4f: (a: wgsl.v4f, b: wgsl.v4f) =>
      vec4f(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w),
    vec4i: (a: wgsl.v4i, b: wgsl.v4i) =>
      vec4i(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w),
    vec4u: (a: wgsl.v4u, b: wgsl.v4u) =>
      vec4u(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w),
  } as Record<VecKind, <T extends vBase>(lhs: T, rhs: T) => T>,

  dot: {
    vec2f: (lhs: wgsl.v2f, rhs: wgsl.v2f) => lhs.x * rhs.x + lhs.y * rhs.y,
    vec2i: (lhs: wgsl.v2i, rhs: wgsl.v2i) => lhs.x * rhs.x + lhs.y * rhs.y,
    vec2u: (lhs: wgsl.v2u, rhs: wgsl.v2u) => lhs.x * rhs.x + lhs.y * rhs.y,
    vec3f: (lhs: wgsl.v3f, rhs: wgsl.v3f) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z,
    vec3i: (lhs: wgsl.v3i, rhs: wgsl.v3i) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z,
    vec3u: (lhs: wgsl.v3u, rhs: wgsl.v3u) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z,
    vec4f: (lhs: wgsl.v4f, rhs: wgsl.v4f) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w,
    vec4i: (lhs: wgsl.v4i, rhs: wgsl.v4i) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w,
    vec4u: (lhs: wgsl.v4u, rhs: wgsl.v4u) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w,
  } as Record<VecKind, <T extends vBase>(lhs: T, rhs: T) => number>,

  normalize: {
    vec2f: (v: wgsl.v2f) => {
      const len = lengthVec2(v);
      return vec2f(v.x / len, v.y / len);
    },
    vec2i: (v: wgsl.v2i) => {
      const len = lengthVec2(v);
      return vec2i(v.x / len, v.y / len);
    },
    vec2u: (v: wgsl.v2u) => {
      const len = lengthVec2(v);
      return vec2u(v.x / len, v.y / len);
    },

    vec3f: (v: wgsl.v3f) => {
      const len = lengthVec3(v);
      return vec3f(v.x / len, v.y / len, v.z / len);
    },
    vec3i: (v: wgsl.v3i) => {
      const len = lengthVec3(v);
      return vec3i(v.x / len, v.y / len, v.z / len);
    },
    vec3u: (v: wgsl.v3u) => {
      const len = lengthVec3(v);
      return vec3u(v.x / len, v.y / len, v.z / len);
    },

    vec4f: (v: wgsl.v4f) => {
      const len = lengthVec4(v);
      return vec4f(v.x / len, v.y / len, v.z / len, v.w / len);
    },
    vec4i: (v: wgsl.v4i) => {
      const len = lengthVec4(v);
      return vec4i(v.x / len, v.y / len, v.z / len, v.w / len);
    },
    vec4u: (v: wgsl.v4u) => {
      const len = lengthVec4(v);
      return vec4u(v.x / len, v.y / len, v.z / len, v.w / len);
    },
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  cross: {
    vec3f: (a: wgsl.v3f, b: wgsl.v3f) => {
      return vec3f(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
    vec3i: (a: wgsl.v3i, b: wgsl.v3i) => {
      return vec3i(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
    vec3u: (a: wgsl.v3u, b: wgsl.v3u) => {
      return vec3u(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
  } as Record<
    'vec3f' | 'vec3i' | 'vec3u',
    <T extends wgsl.v3f | wgsl.v3i | wgsl.v3u>(a: T, b: T) => T
  >,

  floor: {
    vec2f: (v: wgsl.v2f) => vec2f(Math.floor(v.x), Math.floor(v.y)),
    vec2i: (v: wgsl.v2i) => vec2i(Math.floor(v.x), Math.floor(v.y)),
    vec2u: (v: wgsl.v2u) => vec2u(Math.floor(v.x), Math.floor(v.y)),

    vec3f: (v: wgsl.v3f) =>
      vec3f(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z)),
    vec3i: (v: wgsl.v3i) =>
      vec3i(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z)),
    vec3u: (v: wgsl.v3u) =>
      vec3u(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z)),

    vec4f: (v: wgsl.v4f) =>
      vec4f(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z), Math.floor(v.w)),
    vec4i: (v: wgsl.v4i) =>
      vec4i(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z), Math.floor(v.w)),
    vec4u: (v: wgsl.v4u) =>
      vec4u(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z), Math.floor(v.w)),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  max: {
    vec2f: (a: wgsl.v2f, b: wgsl.v2f) =>
      vec2f(Math.max(a.x, b.x), Math.max(a.y, b.y)),
    vec2i: (a: wgsl.v2i, b: wgsl.v2i) =>
      vec2i(Math.max(a.x, b.x), Math.max(a.y, b.y)),
    vec2u: (a: wgsl.v2u, b: wgsl.v2u) =>
      vec2u(Math.max(a.x, b.x), Math.max(a.y, b.y)),

    vec3f: (a: wgsl.v3f, b: wgsl.v3f) =>
      vec3f(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)),
    vec3i: (a: wgsl.v3i, b: wgsl.v3i) =>
      vec3i(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)),
    vec3u: (a: wgsl.v3u, b: wgsl.v3u) =>
      vec3u(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)),

    vec4f: (a: wgsl.v4f, b: wgsl.v4f) =>
      vec4f(
        Math.max(a.x, b.x),
        Math.max(a.y, b.y),
        Math.max(a.z, b.z),
        Math.max(a.w, b.w),
      ),
    vec4i: (a: wgsl.v4i, b: wgsl.v4i) =>
      vec4i(
        Math.max(a.x, b.x),
        Math.max(a.y, b.y),
        Math.max(a.z, b.z),
        Math.max(a.w, b.w),
      ),
    vec4u: (a: wgsl.v4u, b: wgsl.v4u) =>
      vec4u(
        Math.max(a.x, b.x),
        Math.max(a.y, b.y),
        Math.max(a.z, b.z),
        Math.max(a.w, b.w),
      ),
  } as Record<VecKind, <T extends vBase>(a: T, b: T) => T>,

  min: {
    vec2f: (a: wgsl.v2f, b: wgsl.v2f) =>
      vec2f(Math.min(a.x, b.x), Math.min(a.y, b.y)),
    vec2i: (a: wgsl.v2i, b: wgsl.v2i) =>
      vec2i(Math.min(a.x, b.x), Math.min(a.y, b.y)),
    vec2u: (a: wgsl.v2u, b: wgsl.v2u) =>
      vec2u(Math.min(a.x, b.x), Math.min(a.y, b.y)),

    vec3f: (a: wgsl.v3f, b: wgsl.v3f) =>
      vec3f(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)),
    vec3i: (a: wgsl.v3i, b: wgsl.v3i) =>
      vec3i(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)),
    vec3u: (a: wgsl.v3u, b: wgsl.v3u) =>
      vec3u(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)),

    vec4f: (a: wgsl.v4f, b: wgsl.v4f) =>
      vec4f(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.min(a.z, b.z),
        Math.min(a.w, b.w),
      ),
    vec4i: (a: wgsl.v4i, b: wgsl.v4i) =>
      vec4i(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.min(a.z, b.z),
        Math.min(a.w, b.w),
      ),
    vec4u: (a: wgsl.v4u, b: wgsl.v4u) =>
      vec4u(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.min(a.z, b.z),
        Math.min(a.w, b.w),
      ),
  } as Record<VecKind, <T extends vBase>(a: T, b: T) => T>,
};
