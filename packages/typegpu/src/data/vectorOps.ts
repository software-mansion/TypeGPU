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

type $VecBase = { kind: VecKind };

const lengthVec2 = (v: wgsl.$Vec2f | wgsl.$Vec2i | wgsl.$Vec2u) =>
  Math.sqrt(v.x ** 2 + v.y ** 2);
const lengthVec3 = (v: wgsl.$Vec3f | wgsl.$Vec3i | wgsl.$Vec3u) =>
  Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
const lengthVec4 = (v: wgsl.$Vec4f | wgsl.$Vec4i | wgsl.$Vec4u) =>
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
  } as Record<VecKind, (v: $VecBase) => number>,

  add: {
    vec2f: (a: wgsl.$Vec2f, b: wgsl.$Vec2f) => vec2f(a.x + b.x, a.y + b.y),
    vec2i: (a: wgsl.$Vec2i, b: wgsl.$Vec2i) => vec2i(a.x + b.x, a.y + b.y),
    vec2u: (a: wgsl.$Vec2u, b: wgsl.$Vec2u) => vec2u(a.x + b.x, a.y + b.y),

    vec3f: (a: wgsl.$Vec3f, b: wgsl.$Vec3f) =>
      vec3f(a.x + b.x, a.y + b.y, a.z + b.z),
    vec3i: (a: wgsl.$Vec3i, b: wgsl.$Vec3i) =>
      vec3i(a.x + b.x, a.y + b.y, a.z + b.z),
    vec3u: (a: wgsl.$Vec3u, b: wgsl.$Vec3u) =>
      vec3u(a.x + b.x, a.y + b.y, a.z + b.z),

    vec4f: (a: wgsl.$Vec4f, b: wgsl.$Vec4f) =>
      vec4f(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
    vec4i: (a: wgsl.$Vec4i, b: wgsl.$Vec4i) =>
      vec4i(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
    vec4u: (a: wgsl.$Vec4u, b: wgsl.$Vec4u) =>
      vec4u(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
  } as Record<VecKind, <T extends $VecBase>(lhs: T, rhs: T) => T>,

  sub: {
    vec2f: (a: wgsl.$Vec2f, b: wgsl.$Vec2f) => vec2f(a.x - b.x, a.y - b.y),
    vec2i: (a: wgsl.$Vec2i, b: wgsl.$Vec2i) => vec2i(a.x - b.x, a.y - b.y),
    vec2u: (a: wgsl.$Vec2u, b: wgsl.$Vec2u) => vec2u(a.x - b.x, a.y - b.y),

    vec3f: (a: wgsl.$Vec3f, b: wgsl.$Vec3f) =>
      vec3f(a.x - b.x, a.y - b.y, a.z - b.z),
    vec3i: (a: wgsl.$Vec3i, b: wgsl.$Vec3i) =>
      vec3i(a.x - b.x, a.y - b.y, a.z - b.z),
    vec3u: (a: wgsl.$Vec3u, b: wgsl.$Vec3u) =>
      vec3u(a.x - b.x, a.y - b.y, a.z - b.z),

    vec4f: (a: wgsl.$Vec4f, b: wgsl.$Vec4f) =>
      vec4f(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    vec4i: (a: wgsl.$Vec4i, b: wgsl.$Vec4i) =>
      vec4i(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    vec4u: (a: wgsl.$Vec4u, b: wgsl.$Vec4u) =>
      vec4u(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
  } as Record<VecKind, <T extends $VecBase>(lhs: T, rhs: T) => T>,

  mul: {
    vec2f: (s: number, v: wgsl.$Vec2f) => vec2f(s * v.x, s * v.y),
    vec2i: (s: number, v: wgsl.$Vec2i) => vec2i(s * v.x, s * v.y),
    vec2u: (s: number, v: wgsl.$Vec2u) => vec2u(s * v.x, s * v.y),

    vec3f: (s: number, v: wgsl.$Vec3f) => vec3f(s * v.x, s * v.y, s * v.z),
    vec3i: (s: number, v: wgsl.$Vec3i) => vec3i(s * v.x, s * v.y, s * v.z),
    vec3u: (s: number, v: wgsl.$Vec3u) => vec3u(s * v.x, s * v.y, s * v.z),

    vec4f: (s: number, v: wgsl.$Vec4f) =>
      vec4f(s * v.x, s * v.y, s * v.z, s * v.w),
    vec4i: (s: number, v: wgsl.$Vec4i) =>
      vec4i(s * v.x, s * v.y, s * v.z, s * v.w),
    vec4u: (s: number, v: wgsl.$Vec4u) =>
      vec4u(s * v.x, s * v.y, s * v.z, s * v.w),
  } as Record<VecKind, <T extends $VecBase>(s: number, v: T) => T>,

  dot: {
    vec2f: (lhs: wgsl.$Vec2f, rhs: wgsl.$Vec2f) =>
      lhs.x * rhs.x + lhs.y * rhs.y,
    vec2i: (lhs: wgsl.$Vec2i, rhs: wgsl.$Vec2i) =>
      lhs.x * rhs.x + lhs.y * rhs.y,
    vec2u: (lhs: wgsl.$Vec2u, rhs: wgsl.$Vec2u) =>
      lhs.x * rhs.x + lhs.y * rhs.y,
    vec3f: (lhs: wgsl.$Vec3f, rhs: wgsl.$Vec3f) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z,
    vec3i: (lhs: wgsl.$Vec3i, rhs: wgsl.$Vec3i) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z,
    vec3u: (lhs: wgsl.$Vec3u, rhs: wgsl.$Vec3u) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z,
    vec4f: (lhs: wgsl.$Vec4f, rhs: wgsl.$Vec4f) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w,
    vec4i: (lhs: wgsl.$Vec4i, rhs: wgsl.$Vec4i) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w,
    vec4u: (lhs: wgsl.$Vec4u, rhs: wgsl.$Vec4u) =>
      lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w,
  } as Record<VecKind, <T extends $VecBase>(lhs: T, rhs: T) => number>,

  normalize: {
    vec2f: (v: wgsl.$Vec2f) => {
      const len = lengthVec2(v);
      return vec2f(v.x / len, v.y / len);
    },
    vec2i: (v: wgsl.$Vec2i) => {
      const len = lengthVec2(v);
      return vec2i(v.x / len, v.y / len);
    },
    vec2u: (v: wgsl.$Vec2u) => {
      const len = lengthVec2(v);
      return vec2u(v.x / len, v.y / len);
    },

    vec3f: (v: wgsl.$Vec3f) => {
      const len = lengthVec3(v);
      return vec3f(v.x / len, v.y / len, v.z / len);
    },
    vec3i: (v: wgsl.$Vec3i) => {
      const len = lengthVec3(v);
      return vec3i(v.x / len, v.y / len, v.z / len);
    },
    vec3u: (v: wgsl.$Vec3u) => {
      const len = lengthVec3(v);
      return vec3u(v.x / len, v.y / len, v.z / len);
    },

    vec4f: (v: wgsl.$Vec4f) => {
      const len = lengthVec4(v);
      return vec4f(v.x / len, v.y / len, v.z / len, v.w / len);
    },
    vec4i: (v: wgsl.$Vec4i) => {
      const len = lengthVec4(v);
      return vec4i(v.x / len, v.y / len, v.z / len, v.w / len);
    },
    vec4u: (v: wgsl.$Vec4u) => {
      const len = lengthVec4(v);
      return vec4u(v.x / len, v.y / len, v.z / len, v.w / len);
    },
  } as Record<VecKind, <T extends $VecBase>(v: T) => T>,

  cross: {
    vec3f: (a: wgsl.$Vec3f, b: wgsl.$Vec3f) => {
      return vec3f(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
    vec3i: (a: wgsl.$Vec3i, b: wgsl.$Vec3i) => {
      return vec3i(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
    vec3u: (a: wgsl.$Vec3u, b: wgsl.$Vec3u) => {
      return vec3u(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
  } as Record<
    'vec3f' | 'vec3i' | 'vec3u',
    <T extends wgsl.$Vec3f | wgsl.$Vec3i | wgsl.$Vec3u>(a: T, b: T) => T
  >,
};
