import { mat2x2f, mat3x3f, mat4x4f } from './matrix';
import {
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
} from './vector';
import type * as wgsl from './wgslTypes';
import type { VecKind } from './wgslTypes';

type vBase = { kind: VecKind };
type v2 = wgsl.v2f | wgsl.v2h | wgsl.v2i | wgsl.v2u;
type v3 = wgsl.v3f | wgsl.v3h | wgsl.v3i | wgsl.v3u;
type v4 = wgsl.v4f | wgsl.v4h | wgsl.v4i | wgsl.v4u;

type MatKind = 'mat2x2f' | 'mat3x3f' | 'mat4x4f';

const lengthVec2 = (v: v2) => Math.sqrt(v.x ** 2 + v.y ** 2);
const lengthVec3 = (v: v3) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
const lengthVec4 = (v: v4) =>
  Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2 + v.w ** 2);

const dotVec2 = (lhs: v2, rhs: v2) => lhs.x * rhs.x + lhs.y * rhs.y;
const dotVec3 = (lhs: v3, rhs: v3) =>
  lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z;
const dotVec4 = (lhs: v4, rhs: v4) =>
  lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w;

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(low, value), high);

export const VectorOps = {
  abs: {
    vec2f: (v: wgsl.v2f) => vec2f(Math.abs(v.x), Math.abs(v.y)),
    vec2h: (v: wgsl.v2h) => vec2h(Math.abs(v.x), Math.abs(v.y)),
    vec2i: (v: wgsl.v2i) => vec2i(Math.abs(v.x), Math.abs(v.y)),
    vec2u: (v: wgsl.v2u) => vec2u(Math.abs(v.x), Math.abs(v.y)),

    vec3f: (v: wgsl.v3f) => vec3f(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)),
    vec3h: (v: wgsl.v3h) => vec3h(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)),
    vec3i: (v: wgsl.v3i) => vec3i(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)),
    vec3u: (v: wgsl.v3u) => vec3u(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)),

    vec4f: (v: wgsl.v4f) =>
      vec4f(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z), Math.abs(v.w)),
    vec4h: (v: wgsl.v4h) =>
      vec4h(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z), Math.abs(v.w)),
    vec4i: (v: wgsl.v4i) =>
      vec4i(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z), Math.abs(v.w)),
    vec4u: (v: wgsl.v4u) =>
      vec4u(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z), Math.abs(v.w)),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  ceil: {
    vec2f: (v: wgsl.v2f) => vec2f(Math.ceil(v.x), Math.ceil(v.y)),
    vec2h: (v: wgsl.v2h) => vec2h(Math.ceil(v.x), Math.ceil(v.y)),
    vec2i: (v: wgsl.v2i) => vec2i(Math.ceil(v.x), Math.ceil(v.y)),
    vec2u: (v: wgsl.v2u) => vec2u(Math.ceil(v.x), Math.ceil(v.y)),

    vec3f: (v: wgsl.v3f) =>
      vec3f(Math.ceil(v.x), Math.ceil(v.y), Math.ceil(v.z)),
    vec3h: (v: wgsl.v3h) =>
      vec3h(Math.ceil(v.x), Math.ceil(v.y), Math.ceil(v.z)),
    vec3i: (v: wgsl.v3i) =>
      vec3i(Math.ceil(v.x), Math.ceil(v.y), Math.ceil(v.z)),
    vec3u: (v: wgsl.v3u) =>
      vec3u(Math.ceil(v.x), Math.ceil(v.y), Math.ceil(v.z)),

    vec4f: (v: wgsl.v4f) =>
      vec4f(Math.ceil(v.x), Math.ceil(v.y), Math.ceil(v.z), Math.ceil(v.w)),
    vec4h: (v: wgsl.v4h) =>
      vec4h(Math.ceil(v.x), Math.ceil(v.y), Math.ceil(v.z), Math.ceil(v.w)),
    vec4i: (v: wgsl.v4i) =>
      vec4i(Math.ceil(v.x), Math.ceil(v.y), Math.ceil(v.z), Math.ceil(v.w)),
    vec4u: (v: wgsl.v4u) =>
      vec4u(Math.ceil(v.x), Math.ceil(v.y), Math.ceil(v.z), Math.ceil(v.w)),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  clamp: {
    vec2f: (v: wgsl.v2f, low: wgsl.v2f, high: wgsl.v2f) =>
      vec2f(clamp(v.x, low.x, high.x), clamp(v.y, low.y, high.y)),
    vec2h: (v: wgsl.v2h, low: wgsl.v2h, high: wgsl.v2h) =>
      vec2h(clamp(v.x, low.x, high.x), clamp(v.y, low.y, high.y)),
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
    vec3h: (v: wgsl.v3h, low: wgsl.v3h, high: wgsl.v3h) =>
      vec3h(
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
    vec4h: (v: wgsl.v4h, low: wgsl.v4h, high: wgsl.v4h) =>
      vec4h(
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
    vec2h: lengthVec2,
    vec2i: lengthVec2,
    vec2u: lengthVec2,
    vec3f: lengthVec3,
    vec3h: lengthVec3,
    vec3i: lengthVec3,
    vec3u: lengthVec3,
    vec4f: lengthVec4,
    vec4h: lengthVec4,
    vec4i: lengthVec4,
    vec4u: lengthVec4,
  } as Record<VecKind, (v: vBase) => number>,

  add: {
    vec2f: (a: wgsl.v2f, b: wgsl.v2f) => vec2f(a.x + b.x, a.y + b.y),
    vec2h: (a: wgsl.v2h, b: wgsl.v2h) => vec2h(a.x + b.x, a.y + b.y),
    vec2i: (a: wgsl.v2i, b: wgsl.v2i) => vec2i(a.x + b.x, a.y + b.y),
    vec2u: (a: wgsl.v2u, b: wgsl.v2u) => vec2u(a.x + b.x, a.y + b.y),

    vec3f: (a: wgsl.v3f, b: wgsl.v3f) => vec3f(a.x + b.x, a.y + b.y, a.z + b.z),
    vec3h: (a: wgsl.v3h, b: wgsl.v3h) => vec3h(a.x + b.x, a.y + b.y, a.z + b.z),
    vec3i: (a: wgsl.v3i, b: wgsl.v3i) => vec3i(a.x + b.x, a.y + b.y, a.z + b.z),
    vec3u: (a: wgsl.v3u, b: wgsl.v3u) => vec3u(a.x + b.x, a.y + b.y, a.z + b.z),

    vec4f: (a: wgsl.v4f, b: wgsl.v4f) =>
      vec4f(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
    vec4h: (a: wgsl.v4h, b: wgsl.v4h) =>
      vec4h(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
    vec4i: (a: wgsl.v4i, b: wgsl.v4i) =>
      vec4i(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
    vec4u: (a: wgsl.v4u, b: wgsl.v4u) =>
      vec4u(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
  } as Record<VecKind, <T extends vBase>(lhs: T, rhs: T) => T>,

  sub: {
    vec2f: (a: wgsl.v2f, b: wgsl.v2f) => vec2f(a.x - b.x, a.y - b.y),
    vec2h: (a: wgsl.v2h, b: wgsl.v2h) => vec2h(a.x - b.x, a.y - b.y),
    vec2i: (a: wgsl.v2i, b: wgsl.v2i) => vec2i(a.x - b.x, a.y - b.y),
    vec2u: (a: wgsl.v2u, b: wgsl.v2u) => vec2u(a.x - b.x, a.y - b.y),

    vec3f: (a: wgsl.v3f, b: wgsl.v3f) => vec3f(a.x - b.x, a.y - b.y, a.z - b.z),
    vec3h: (a: wgsl.v3h, b: wgsl.v3h) => vec3h(a.x - b.x, a.y - b.y, a.z - b.z),
    vec3i: (a: wgsl.v3i, b: wgsl.v3i) => vec3i(a.x - b.x, a.y - b.y, a.z - b.z),
    vec3u: (a: wgsl.v3u, b: wgsl.v3u) => vec3u(a.x - b.x, a.y - b.y, a.z - b.z),

    vec4f: (a: wgsl.v4f, b: wgsl.v4f) =>
      vec4f(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    vec4h: (a: wgsl.v4h, b: wgsl.v4h) =>
      vec4h(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    vec4i: (a: wgsl.v4i, b: wgsl.v4i) =>
      vec4i(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    vec4u: (a: wgsl.v4u, b: wgsl.v4u) =>
      vec4u(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
  } as Record<VecKind, <T extends vBase>(lhs: T, rhs: T) => T>,

  mulSxV: {
    vec2f: (s: number, v: wgsl.v2f) => vec2f(s * v.x, s * v.y),
    vec2h: (s: number, v: wgsl.v2h) => vec2h(s * v.x, s * v.y),
    vec2i: (s: number, v: wgsl.v2i) => vec2i(s * v.x, s * v.y),
    vec2u: (s: number, v: wgsl.v2u) => vec2u(s * v.x, s * v.y),

    vec3f: (s: number, v: wgsl.v3f) => vec3f(s * v.x, s * v.y, s * v.z),
    vec3h: (s: number, v: wgsl.v3h) => vec3h(s * v.x, s * v.y, s * v.z),
    vec3i: (s: number, v: wgsl.v3i) => vec3i(s * v.x, s * v.y, s * v.z),
    vec3u: (s: number, v: wgsl.v3u) => vec3u(s * v.x, s * v.y, s * v.z),

    vec4f: (s: number, v: wgsl.v4f) =>
      vec4f(s * v.x, s * v.y, s * v.z, s * v.w),
    vec4h: (s: number, v: wgsl.v4h) =>
      vec4h(s * v.x, s * v.y, s * v.z, s * v.w),
    vec4i: (s: number, v: wgsl.v4i) =>
      vec4i(s * v.x, s * v.y, s * v.z, s * v.w),
    vec4u: (s: number, v: wgsl.v4u) =>
      vec4u(s * v.x, s * v.y, s * v.z, s * v.w),

    mat2x2f: (s: number, m: wgsl.m2x2f) => {
      const m_ = m.columns as [wgsl.v2f, wgsl.v2f];
      return mat2x2f(s * m_[0].x, s * m_[0].y, s * m_[1].x, s * m_[1].y);
    },

    mat3x3f: (s: number, m: wgsl.m3x3f) => {
      const m_ = m.columns as [wgsl.v3f, wgsl.v3f, wgsl.v3f];
      return mat3x3f(
        s * m_[0].x,
        s * m_[0].y,
        s * m_[0].z,

        s * m_[1].x,
        s * m_[1].y,
        s * m_[1].z,

        s * m_[2].x,
        s * m_[2].y,
        s * m_[2].z,
      );
    },

    mat4x4f: (s: number, m: wgsl.m4x4f) => {
      const m_ = m.columns as [wgsl.v4f, wgsl.v4f, wgsl.v4f, wgsl.v4f];
      return mat3x3f(
        s * m_[0].x,
        s * m_[0].y,
        s * m_[0].z,
        s * m_[0].w,

        s * m_[1].x,
        s * m_[1].y,
        s * m_[1].z,
        s * m_[1].w,

        s * m_[2].x,
        s * m_[2].y,
        s * m_[2].z,
        s * m_[2].w,

        s * m_[3].x,
        s * m_[3].y,
        s * m_[3].z,
        s * m_[3].w,
      );
    },
  } as Record<
    VecKind | MatKind,
    <T extends vBase | wgsl.AnyMatInstance>(s: number, v: T) => T
  >,

  mulVxV: {
    vec2f: (a: wgsl.v2f, b: wgsl.v2f) => vec2f(a.x * b.x, a.y * b.y),
    vec2h: (a: wgsl.v2h, b: wgsl.v2h) => vec2h(a.x * b.x, a.y * b.y),
    vec2i: (a: wgsl.v2i, b: wgsl.v2i) => vec2i(a.x * b.x, a.y * b.y),
    vec2u: (a: wgsl.v2u, b: wgsl.v2u) => vec2u(a.x * b.x, a.y * b.y),

    vec3f: (a: wgsl.v3f, b: wgsl.v3f) => vec3f(a.x * b.x, a.y * b.y, a.z * b.z),
    vec3h: (a: wgsl.v3h, b: wgsl.v3h) => vec3h(a.x * b.x, a.y * b.y, a.z * b.z),
    vec3i: (a: wgsl.v3i, b: wgsl.v3i) => vec3i(a.x * b.x, a.y * b.y, a.z * b.z),
    vec3u: (a: wgsl.v3u, b: wgsl.v3u) => vec3u(a.x * b.x, a.y * b.y, a.z * b.z),

    vec4f: (a: wgsl.v4f, b: wgsl.v4f) =>
      vec4f(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w),
    vec4h: (a: wgsl.v4h, b: wgsl.v4h) =>
      vec4h(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w),
    vec4i: (a: wgsl.v4i, b: wgsl.v4i) =>
      vec4i(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w),
    vec4u: (a: wgsl.v4u, b: wgsl.v4u) =>
      vec4u(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w),

    mat2x2f: (a: wgsl.m2x2f, b: wgsl.m2x2f) => {
      const a_ = a.columns as [wgsl.v2f, wgsl.v2f];
      const b_ = b.columns as [wgsl.v2f, wgsl.v2f];

      return mat2x2f(
        a_[0].x * b_[0].x + a_[1].x * b_[0].y,
        a_[0].y * b_[0].x + a_[1].y * b_[0].y,

        a_[0].x * b_[1].x + a_[1].x * b_[1].y,
        a_[0].y * b_[1].x + a_[1].y * b_[1].y,
      );
    },

    mat3x3f: (a: wgsl.m3x3f, b: wgsl.m3x3f) => {
      const a_ = a.columns as [wgsl.v3f, wgsl.v3f, wgsl.v3f];
      const b_ = b.columns as [wgsl.v3f, wgsl.v3f, wgsl.v3f];

      return mat3x3f(
        a_[0].x * b_[0].x + a_[1].x * b_[0].y + a_[2].x * b_[0].z,
        a_[0].y * b_[0].x + a_[1].y * b_[0].y + a_[2].y * b_[0].z,
        a_[0].z * b_[0].x + a_[1].z * b_[0].y + a_[2].z * b_[0].z,

        a_[0].x * b_[1].x + a_[1].x * b_[1].y + a_[2].x * b_[1].z,
        a_[0].y * b_[1].x + a_[1].y * b_[1].y + a_[2].y * b_[1].z,
        a_[0].z * b_[1].x + a_[1].z * b_[1].y + a_[2].z * b_[1].z,

        a_[0].x * b_[2].x + a_[1].x * b_[2].y + a_[2].x * b_[2].z,
        a_[0].y * b_[2].x + a_[1].y * b_[2].y + a_[2].y * b_[2].z,
        a_[0].z * b_[2].x + a_[1].z * b_[2].y + a_[2].z * b_[2].z,
      );
    },

    mat4x4f: (a: wgsl.m4x4f, b: wgsl.m4x4f) => {
      const a_ = a.columns as [wgsl.v4f, wgsl.v4f, wgsl.v4f, wgsl.v4f];
      const b_ = b.columns as [wgsl.v4f, wgsl.v4f, wgsl.v4f, wgsl.v4f];

      return mat4x4f(
        a_[0].x * b_[0].x +
          a_[1].x * b_[0].y +
          a_[2].x * b_[0].z +
          a_[3].x * b_[0].w,
        a_[0].y * b_[0].x +
          a_[1].y * b_[0].y +
          a_[2].y * b_[0].z +
          a_[3].y * b_[0].w,
        a_[0].z * b_[0].x +
          a_[1].z * b_[0].y +
          a_[2].z * b_[0].z +
          a_[3].z * b_[0].w,
        a_[0].w * b_[0].x +
          a_[1].w * b_[0].y +
          a_[2].w * b_[0].z +
          a_[3].w * b_[0].w,

        a_[0].x * b_[1].x +
          a_[1].x * b_[1].y +
          a_[2].x * b_[1].z +
          a_[3].x * b_[1].w,
        a_[0].y * b_[1].x +
          a_[1].y * b_[1].y +
          a_[2].y * b_[1].z +
          a_[3].y * b_[1].w,
        a_[0].z * b_[1].x +
          a_[1].z * b_[1].y +
          a_[2].z * b_[1].z +
          a_[3].z * b_[1].w,
        a_[0].w * b_[1].x +
          a_[1].w * b_[1].y +
          a_[2].w * b_[1].z +
          a_[3].w * b_[1].w,

        a_[0].x * b_[2].x +
          a_[1].x * b_[2].y +
          a_[2].x * b_[2].z +
          a_[3].x * b_[2].w,
        a_[0].y * b_[2].x +
          a_[1].y * b_[2].y +
          a_[2].y * b_[2].z +
          a_[3].y * b_[2].w,
        a_[0].z * b_[2].x +
          a_[1].z * b_[2].y +
          a_[2].z * b_[2].z +
          a_[3].z * b_[2].w,
        a_[0].w * b_[2].x +
          a_[1].w * b_[2].y +
          a_[2].w * b_[2].z +
          a_[3].w * b_[2].w,

        a_[0].x * b_[3].x +
          a_[1].x * b_[3].y +
          a_[2].x * b_[3].z +
          a_[3].x * b_[3].w,
        a_[0].y * b_[3].x +
          a_[1].y * b_[3].y +
          a_[2].y * b_[3].z +
          a_[3].y * b_[3].w,
        a_[0].z * b_[3].x +
          a_[1].z * b_[3].y +
          a_[2].z * b_[3].z +
          a_[3].z * b_[3].w,
        a_[0].w * b_[3].x +
          a_[1].w * b_[3].y +
          a_[2].w * b_[3].z +
          a_[3].w * b_[3].w,
      );
    },
  } as Record<
    VecKind | MatKind,
    <T extends vBase | wgsl.AnyMatInstance>(lhs: T, rhs: T) => T
  >,

  dot: {
    vec2f: dotVec2,
    vec2h: dotVec2,
    vec2i: dotVec2,
    vec2u: dotVec2,
    vec3f: dotVec3,
    vec3h: dotVec3,
    vec3i: dotVec3,
    vec3u: dotVec3,
    vec4f: dotVec4,
    vec4h: dotVec4,
    vec4i: dotVec4,
    vec4u: dotVec4,
  } as Record<VecKind, <T extends vBase>(lhs: T, rhs: T) => number>,

  normalize: {
    vec2f: (v: wgsl.v2f) => {
      const len = lengthVec2(v);
      return vec2f(v.x / len, v.y / len);
    },
    vec2h: (v: wgsl.v2h) => {
      const len = lengthVec2(v);
      return vec2h(v.x / len, v.y / len);
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
    vec3h: (v: wgsl.v3h) => {
      const len = lengthVec3(v);
      return vec3h(v.x / len, v.y / len, v.z / len);
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
    vec4h: (v: wgsl.v4h) => {
      const len = lengthVec4(v);
      return vec4h(v.x / len, v.y / len, v.z / len, v.w / len);
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
    vec3h: (a: wgsl.v3h, b: wgsl.v3h) => {
      return vec3h(
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
    vec2h: (v: wgsl.v2h) => vec2h(Math.floor(v.x), Math.floor(v.y)),
    vec2i: (v: wgsl.v2i) => vec2i(Math.floor(v.x), Math.floor(v.y)),
    vec2u: (v: wgsl.v2u) => vec2u(Math.floor(v.x), Math.floor(v.y)),

    vec3f: (v: wgsl.v3f) =>
      vec3f(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z)),
    vec3h: (v: wgsl.v3h) =>
      vec3h(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z)),
    vec3i: (v: wgsl.v3i) =>
      vec3i(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z)),
    vec3u: (v: wgsl.v3u) =>
      vec3u(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z)),

    vec4f: (v: wgsl.v4f) =>
      vec4f(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z), Math.floor(v.w)),
    vec4h: (v: wgsl.v4h) =>
      vec4h(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z), Math.floor(v.w)),
    vec4i: (v: wgsl.v4i) =>
      vec4i(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z), Math.floor(v.w)),
    vec4u: (v: wgsl.v4u) =>
      vec4u(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z), Math.floor(v.w)),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  max: {
    vec2f: (a: wgsl.v2f, b: wgsl.v2f) =>
      vec2f(Math.max(a.x, b.x), Math.max(a.y, b.y)),
    vec2h: (a: wgsl.v2h, b: wgsl.v2h) =>
      vec2h(Math.max(a.x, b.x), Math.max(a.y, b.y)),
    vec2i: (a: wgsl.v2i, b: wgsl.v2i) =>
      vec2i(Math.max(a.x, b.x), Math.max(a.y, b.y)),
    vec2u: (a: wgsl.v2u, b: wgsl.v2u) =>
      vec2u(Math.max(a.x, b.x), Math.max(a.y, b.y)),

    vec3f: (a: wgsl.v3f, b: wgsl.v3f) =>
      vec3f(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)),
    vec3h: (a: wgsl.v3h, b: wgsl.v3h) =>
      vec3h(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)),
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
    vec4h: (a: wgsl.v4h, b: wgsl.v4h) =>
      vec4h(
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
    vec2h: (a: wgsl.v2h, b: wgsl.v2h) =>
      vec2h(Math.min(a.x, b.x), Math.min(a.y, b.y)),
    vec2i: (a: wgsl.v2i, b: wgsl.v2i) =>
      vec2i(Math.min(a.x, b.x), Math.min(a.y, b.y)),
    vec2u: (a: wgsl.v2u, b: wgsl.v2u) =>
      vec2u(Math.min(a.x, b.x), Math.min(a.y, b.y)),

    vec3f: (a: wgsl.v3f, b: wgsl.v3f) =>
      vec3f(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)),
    vec3h: (a: wgsl.v3h, b: wgsl.v3h) =>
      vec3h(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)),
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
    vec4h: (a: wgsl.v4h, b: wgsl.v4h) =>
      vec4h(
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

  pow: {
    vec2f: (base: wgsl.v2f, exponent: wgsl.v2f) =>
      vec2f(base.x ** exponent.x, base.y ** exponent.y),
    vec2h: (base: wgsl.v2h, exponent: wgsl.v2h) =>
      vec2h(base.x ** exponent.x, base.y ** exponent.y),

    vec3f: (base: wgsl.v3f, exponent: wgsl.v3f) =>
      vec3f(base.x ** exponent.x, base.y ** exponent.y, base.z ** exponent.z),
    vec3h: (base: wgsl.v3h, exponent: wgsl.v3h) =>
      vec3h(base.x ** exponent.x, base.y ** exponent.y, base.z ** exponent.z),

    vec4f: (base: wgsl.v4f, exponent: wgsl.v4f) =>
      vec4f(
        base.x ** exponent.x,
        base.y ** exponent.y,
        base.z ** exponent.z,
        base.w ** exponent.w,
      ),
    vec4h: (base: wgsl.v4h, exponent: wgsl.v4h) =>
      vec4h(
        base.x ** exponent.x,
        base.y ** exponent.y,
        base.z ** exponent.z,
        base.w ** exponent.w,
      ),
  } as Record<
    'vec2f' | 'vec3f' | 'vec4f' | 'vec2h' | 'vec3h' | 'vec4h' | 'number',
    <
      T extends
        | wgsl.v2f
        | wgsl.v3f
        | wgsl.v4f
        | wgsl.v2h
        | wgsl.v3h
        | wgsl.v4h
        | number,
    >(
      a: T,
      b: T,
    ) => T
  >,

  mix: {
    vec2f: (e1: wgsl.v2f, e2: wgsl.v2f, e3: wgsl.v2f | number) => {
      if (typeof e3 === 'number') {
        return vec2f(e1.x * (1 - e3) + e2.x * e3, e1.y * (1 - e3) + e2.y * e3);
      }
      return vec2f(
        e1.x * (1 - e3.x) + e2.x * e3.x,
        e1.y * (1 - e3.y) + e2.y * e3.y,
      );
    },
    vec2h: (e1: wgsl.v2h, e2: wgsl.v2h, e3: wgsl.v2h | number) => {
      if (typeof e3 === 'number') {
        return vec2h(e1.x * (1 - e3) + e2.x * e3, e1.y * (1 - e3) + e2.y * e3);
      }
      return vec2h(
        e1.x * (1 - e3.x) + e2.x * e3.x,
        e1.y * (1 - e3.y) + e2.y * e3.y,
      );
    },

    vec3f: (e1: wgsl.v3f, e2: wgsl.v3f, e3: wgsl.v3f | number) => {
      if (typeof e3 === 'number') {
        return vec3f(
          e1.x * (1 - e3) + e2.x * e3,
          e1.y * (1 - e3) + e2.y * e3,
          e1.z * (1 - e3) + e2.z * e3,
        );
      }
      return vec3f(
        e1.x * (1 - e3.x) + e2.x * e3.x,
        e1.y * (1 - e3.y) + e2.y * e3.y,
        e1.z * (1 - e3.z) + e2.z * e3.z,
      );
    },
    vec3h: (e1: wgsl.v3h, e2: wgsl.v3h, e3: wgsl.v3h | number) => {
      if (typeof e3 === 'number') {
        return vec3h(
          e1.x * (1 - e3) + e2.x * e3,
          e1.y * (1 - e3) + e2.y * e3,
          e1.z * (1 - e3) + e2.z * e3,
        );
      }
      return vec3h(
        e1.x * (1 - e3.x) + e2.x * e3.x,
        e1.y * (1 - e3.y) + e2.y * e3.y,
        e1.z * (1 - e3.z) + e2.z * e3.z,
      );
    },

    vec4f: (e1: wgsl.v4f, e2: wgsl.v4f, e3: wgsl.v4f | number) => {
      if (typeof e3 === 'number') {
        return vec4f(
          e1.x * (1 - e3) + e2.x * e3,
          e1.y * (1 - e3) + e2.y * e3,
          e1.z * (1 - e3) + e2.z * e3,
          e1.w * (1 - e3) + e2.w * e3,
        );
      }
      return vec4f(
        e1.x * (1 - e3.x) + e2.x * e3.x,
        e1.y * (1 - e3.y) + e2.y * e3.y,
        e1.z * (1 - e3.z) + e2.z * e3.z,
        e1.w * (1 - e3.w) + e2.w * e3.w,
      );
    },
    vec4h: (e1: wgsl.v4h, e2: wgsl.v4h, e3: wgsl.v4h | number) => {
      if (typeof e3 === 'number') {
        return vec4h(
          e1.x * (1 - e3) + e2.x * e3,
          e1.y * (1 - e3) + e2.y * e3,
          e1.z * (1 - e3) + e2.z * e3,
          e1.w * (1 - e3) + e2.w * e3,
        );
      }
      return vec4h(
        e1.x * (1 - e3.x) + e2.x * e3.x,
        e1.y * (1 - e3.y) + e2.y * e3.y,
        e1.z * (1 - e3.z) + e2.z * e3.z,
        e1.w * (1 - e3.w) + e2.w * e3.w,
      );
    },
  } as Record<
    'vec2f' | 'vec3f' | 'vec4f' | 'vec2h' | 'vec3h' | 'vec4h',
    <T extends wgsl.v2f | wgsl.v3f | wgsl.v4f | wgsl.v2h | wgsl.v3h | wgsl.v4h>(
      a: T,
      b: T,
      c: T | number,
    ) => T
  >,
};
