import { TypeCatalog } from '../shared/internalMeta.js';
import { mat2x2f, mat3x3f, mat4x4f } from './matrix.js';
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
import type { vBase } from './wgslTypes.js';
import type * as wgsl from './wgslTypes.js';

type v2 = wgsl.v2f | wgsl.v2h | wgsl.v2i | wgsl.v2u;
type v3 = wgsl.v3f | wgsl.v3h | wgsl.v3i | wgsl.v3u;
type v4 = wgsl.v4f | wgsl.v4h | wgsl.v4i | wgsl.v4u;

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

type UnaryOp = (a: number) => number;
type BinaryOp = (a: number, b: number) => number;

const unary2f = (op: UnaryOp) => (a: wgsl.v2f) => vec2f(op(a.x), op(a.y));
const unary2h = (op: UnaryOp) => (a: wgsl.v2h) => vec2h(op(a.x), op(a.y));
const unary2i = (op: UnaryOp) => (a: wgsl.v2i) => vec2i(op(a.x), op(a.y));
const unary2u = (op: UnaryOp) => (a: wgsl.v2u) => vec2u(op(a.x), op(a.y));

const unary3f = (op: UnaryOp) => (a: wgsl.v3f) =>
  vec3f(op(a.x), op(a.y), op(a.z));

const unary3h = (op: UnaryOp) => (a: wgsl.v3h) =>
  vec3h(op(a.x), op(a.y), op(a.z));

const unary3i = (op: UnaryOp) => (a: wgsl.v3i) =>
  vec3i(op(a.x), op(a.y), op(a.z));

const unary3u = (op: UnaryOp) => (a: wgsl.v3u) =>
  vec3u(op(a.x), op(a.y), op(a.z));

const unary4f = (op: UnaryOp) => (a: wgsl.v4f) =>
  vec4f(op(a.x), op(a.y), op(a.z), op(a.w));

const unary4h = (op: UnaryOp) => (a: wgsl.v4h) =>
  vec4h(op(a.x), op(a.y), op(a.z), op(a.w));

const unary4i = (op: UnaryOp) => (a: wgsl.v4i) =>
  vec4i(op(a.x), op(a.y), op(a.z), op(a.w));

const unary4u = (op: UnaryOp) => (a: wgsl.v4u) =>
  vec4u(op(a.x), op(a.y), op(a.z), op(a.w));

const binaryComponentWise2f = (op: BinaryOp) => (a: wgsl.v2f, b: wgsl.v2f) =>
  vec2f(op(a.x, b.x), op(a.y, b.y));

const binaryComponentWise2h = (op: BinaryOp) => (a: wgsl.v2h, b: wgsl.v2h) =>
  vec2h(op(a.x, b.x), op(a.y, b.y));

const binaryComponentWise2i = (op: BinaryOp) => (a: wgsl.v2i, b: wgsl.v2i) =>
  vec2i(op(a.x, b.x), op(a.y, b.y));

const binaryComponentWise2u = (op: BinaryOp) => (a: wgsl.v2u, b: wgsl.v2u) =>
  vec2u(op(a.x, b.x), op(a.y, b.y));

const binaryComponentWise3f = (op: BinaryOp) => (a: wgsl.v3f, b: wgsl.v3f) =>
  vec3f(op(a.x, b.x), op(a.y, b.y), op(a.z, b.z));

const binaryComponentWise3h = (op: BinaryOp) => (a: wgsl.v3h, b: wgsl.v3h) =>
  vec3h(op(a.x, b.x), op(a.y, b.y), op(a.z, b.z));

const binaryComponentWise3i = (op: BinaryOp) => (a: wgsl.v3i, b: wgsl.v3i) =>
  vec3i(op(a.x, b.x), op(a.y, b.y), op(a.z, b.z));

const binaryComponentWise3u = (op: BinaryOp) => (a: wgsl.v3u, b: wgsl.v3u) =>
  vec3u(op(a.x, b.x), op(a.y, b.y), op(a.z, b.z));

const binaryComponentWise4f = (op: BinaryOp) => (a: wgsl.v4f, b: wgsl.v4f) =>
  vec4f(op(a.x, b.x), op(a.y, b.y), op(a.z, b.z), op(a.w, b.w));

const binaryComponentWise4h = (op: BinaryOp) => (a: wgsl.v4h, b: wgsl.v4h) =>
  vec4h(op(a.x, b.x), op(a.y, b.y), op(a.z, b.z), op(a.w, b.w));

const binaryComponentWise4i = (op: BinaryOp) => (a: wgsl.v4i, b: wgsl.v4i) =>
  vec4i(op(a.x, b.x), op(a.y, b.y), op(a.z, b.z), op(a.w, b.w));

const binaryComponentWise4u = (op: BinaryOp) => (a: wgsl.v4u, b: wgsl.v4u) =>
  vec4u(op(a.x, b.x), op(a.y, b.y), op(a.z, b.z), op(a.w, b.w));

export const VectorOps = {
  abs: {
    [TypeCatalog.v2f]: unary2f(Math.abs),
    [TypeCatalog.v2h]: unary2h(Math.abs),
    [TypeCatalog.v2i]: unary2i(Math.abs),
    [TypeCatalog.v2u]: unary2u(Math.abs),

    [TypeCatalog.v3f]: unary3f(Math.abs),
    [TypeCatalog.v3h]: unary3h(Math.abs),
    [TypeCatalog.v3i]: unary3i(Math.abs),
    [TypeCatalog.v3u]: unary3u(Math.abs),

    [TypeCatalog.v4f]: unary4f(Math.abs),
    [TypeCatalog.v4h]: unary4h(Math.abs),
    [TypeCatalog.v4i]: unary4i(Math.abs),
    [TypeCatalog.v4u]: unary4u(Math.abs),
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(v: T) => T>,

  atan2: {
    [TypeCatalog.v2f]: binaryComponentWise2f(Math.atan2),
    [TypeCatalog.v2h]: binaryComponentWise2h(Math.atan2),
    [TypeCatalog.v2i]: binaryComponentWise2i(Math.atan2),
    [TypeCatalog.v2u]: binaryComponentWise2u(Math.atan2),

    [TypeCatalog.v3f]: binaryComponentWise3f(Math.atan2),
    [TypeCatalog.v3h]: binaryComponentWise3h(Math.atan2),
    [TypeCatalog.v3i]: binaryComponentWise3i(Math.atan2),
    [TypeCatalog.v3u]: binaryComponentWise3u(Math.atan2),

    [TypeCatalog.v4f]: binaryComponentWise4f(Math.atan2),
    [TypeCatalog.v4h]: binaryComponentWise4h(Math.atan2),
    [TypeCatalog.v4i]: binaryComponentWise4i(Math.atan2),
    [TypeCatalog.v4u]: binaryComponentWise4u(Math.atan2),
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(a: T, b: T) => T>,

  acos: {
    [TypeCatalog.v2f]: unary2f(Math.acos),
    [TypeCatalog.v2h]: unary2h(Math.acos),
    [TypeCatalog.v2i]: unary2i(Math.acos),
    [TypeCatalog.v2u]: unary2u(Math.acos),

    [TypeCatalog.v3f]: unary3f(Math.acos),
    [TypeCatalog.v3h]: unary3h(Math.acos),
    [TypeCatalog.v3i]: unary3i(Math.acos),
    [TypeCatalog.v3u]: unary3u(Math.acos),

    [TypeCatalog.v4f]: unary4f(Math.acos),
    [TypeCatalog.v4h]: unary4h(Math.acos),
    [TypeCatalog.v4i]: unary4i(Math.acos),
    [TypeCatalog.v4u]: unary4u(Math.acos),
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(v: T) => T>,

  asin: {
    [TypeCatalog.v2f]: unary2f(Math.asin),
    [TypeCatalog.v2h]: unary2h(Math.asin),
    [TypeCatalog.v2i]: unary2i(Math.asin),
    [TypeCatalog.v2u]: unary2u(Math.asin),

    [TypeCatalog.v3f]: unary3f(Math.asin),
    [TypeCatalog.v3h]: unary3h(Math.asin),
    [TypeCatalog.v3i]: unary3i(Math.asin),
    [TypeCatalog.v3u]: unary3u(Math.asin),

    [TypeCatalog.v4f]: unary4f(Math.asin),
    [TypeCatalog.v4h]: unary4h(Math.asin),
    [TypeCatalog.v4i]: unary4i(Math.asin),
    [TypeCatalog.v4u]: unary4u(Math.asin),
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(v: T) => T>,

  ceil: {
    [TypeCatalog.v2f]: unary2f(Math.ceil),
    [TypeCatalog.v2h]: unary2h(Math.ceil),
    [TypeCatalog.v2i]: unary2i(Math.ceil),
    [TypeCatalog.v2u]: unary2u(Math.ceil),

    [TypeCatalog.v3f]: unary3f(Math.ceil),
    [TypeCatalog.v3h]: unary3h(Math.ceil),
    [TypeCatalog.v3i]: unary3i(Math.ceil),
    [TypeCatalog.v3u]: unary3u(Math.ceil),

    [TypeCatalog.v4f]: unary4f(Math.ceil),
    [TypeCatalog.v4h]: unary4h(Math.ceil),
    [TypeCatalog.v4i]: unary4i(Math.ceil),
    [TypeCatalog.v4u]: unary4u(Math.ceil),
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(v: T) => T>,

  clamp: {
    [TypeCatalog.v2f]: (v: wgsl.v2f, low: wgsl.v2f, high: wgsl.v2f) =>
      vec2f(clamp(v.x, low.x, high.x), clamp(v.y, low.y, high.y)),
    [TypeCatalog.v2h]: (v: wgsl.v2h, low: wgsl.v2h, high: wgsl.v2h) =>
      vec2h(clamp(v.x, low.x, high.x), clamp(v.y, low.y, high.y)),
    [TypeCatalog.v2i]: (v: wgsl.v2i, low: wgsl.v2i, high: wgsl.v2i) =>
      vec2i(clamp(v.x, low.x, high.x), clamp(v.y, low.y, high.y)),
    [TypeCatalog.v2u]: (v: wgsl.v2u, low: wgsl.v2u, high: wgsl.v2u) =>
      vec2u(clamp(v.x, low.x, high.x), clamp(v.y, low.y, high.y)),

    [TypeCatalog.v3f]: (v: wgsl.v3f, low: wgsl.v3f, high: wgsl.v3f) =>
      vec3f(
        clamp(v.x, low.x, high.x),
        clamp(v.y, low.y, high.y),
        clamp(v.z, low.z, high.z),
      ),
    [TypeCatalog.v3h]: (v: wgsl.v3h, low: wgsl.v3h, high: wgsl.v3h) =>
      vec3h(
        clamp(v.x, low.x, high.x),
        clamp(v.y, low.y, high.y),
        clamp(v.z, low.z, high.z),
      ),
    [TypeCatalog.v3i]: (v: wgsl.v3i, low: wgsl.v3i, high: wgsl.v3f) =>
      vec3i(
        clamp(v.x, low.x, high.x),
        clamp(v.y, low.y, high.y),
        clamp(v.z, low.z, high.z),
      ),
    [TypeCatalog.v3u]: (v: wgsl.v3u, low: wgsl.v3u, high: wgsl.v3f) =>
      vec3u(
        clamp(v.x, low.x, high.x),
        clamp(v.y, low.y, high.y),
        clamp(v.z, low.z, high.z),
      ),

    [TypeCatalog.v4f]: (v: wgsl.v4f, low: wgsl.v4f, high: wgsl.v4f) =>
      vec4f(
        clamp(v.x, low.x, high.x),
        clamp(v.y, low.y, high.y),
        clamp(v.z, low.z, high.z),
        clamp(v.w, low.w, high.w),
      ),
    [TypeCatalog.v4h]: (v: wgsl.v4h, low: wgsl.v4h, high: wgsl.v4h) =>
      vec4h(
        clamp(v.x, low.x, high.x),
        clamp(v.y, low.y, high.y),
        clamp(v.z, low.z, high.z),
        clamp(v.w, low.w, high.w),
      ),
    [TypeCatalog.v4i]: (v: wgsl.v4i, low: wgsl.v4i, high: wgsl.v4i) =>
      vec4i(
        clamp(v.x, low.x, high.x),
        clamp(v.y, low.y, high.y),
        clamp(v.z, low.z, high.z),
        clamp(v.w, low.w, high.w),
      ),
    [TypeCatalog.v4u]: (v: wgsl.v4u, low: wgsl.v4u, high: wgsl.v4u) =>
      vec4u(
        clamp(v.x, low.x, high.x),
        clamp(v.y, low.y, high.y),
        clamp(v.z, low.z, high.z),
        clamp(v.w, low.w, high.w),
      ),
  } as Record<
    wgsl.VecInstanceTypeID,
    <T extends vBase>(v: T, low: T, high: T) => T
  >,

  length: {
    [TypeCatalog.v2f]: lengthVec2,
    [TypeCatalog.v2h]: lengthVec2,
    [TypeCatalog.v2i]: lengthVec2,
    [TypeCatalog.v2u]: lengthVec2,
    [TypeCatalog.v3f]: lengthVec3,
    [TypeCatalog.v3h]: lengthVec3,
    [TypeCatalog.v3i]: lengthVec3,
    [TypeCatalog.v3u]: lengthVec3,
    [TypeCatalog.v4f]: lengthVec4,
    [TypeCatalog.v4h]: lengthVec4,
    [TypeCatalog.v4i]: lengthVec4,
    [TypeCatalog.v4u]: lengthVec4,
  } as Record<wgsl.VecInstanceTypeID, (v: vBase) => number>,

  add: {
    [TypeCatalog.v2f]: (a: wgsl.v2f, b: wgsl.v2f) =>
      vec2f(a.x + b.x, a.y + b.y),
    [TypeCatalog.v2h]: (a: wgsl.v2h, b: wgsl.v2h) =>
      vec2h(a.x + b.x, a.y + b.y),
    [TypeCatalog.v2i]: (a: wgsl.v2i, b: wgsl.v2i) =>
      vec2i(a.x + b.x, a.y + b.y),
    [TypeCatalog.v2u]: (a: wgsl.v2u, b: wgsl.v2u) =>
      vec2u(a.x + b.x, a.y + b.y),

    [TypeCatalog.v3f]: (a: wgsl.v3f, b: wgsl.v3f) =>
      vec3f(a.x + b.x, a.y + b.y, a.z + b.z),
    [TypeCatalog.v3h]: (a: wgsl.v3h, b: wgsl.v3h) =>
      vec3h(a.x + b.x, a.y + b.y, a.z + b.z),
    [TypeCatalog.v3i]: (a: wgsl.v3i, b: wgsl.v3i) =>
      vec3i(a.x + b.x, a.y + b.y, a.z + b.z),
    [TypeCatalog.v3u]: (a: wgsl.v3u, b: wgsl.v3u) =>
      vec3u(a.x + b.x, a.y + b.y, a.z + b.z),

    [TypeCatalog.v4f]: (a: wgsl.v4f, b: wgsl.v4f) =>
      vec4f(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
    [TypeCatalog.v4h]: (a: wgsl.v4h, b: wgsl.v4h) =>
      vec4h(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
    [TypeCatalog.v4i]: (a: wgsl.v4i, b: wgsl.v4i) =>
      vec4i(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
    [TypeCatalog.v4u]: (a: wgsl.v4u, b: wgsl.v4u) =>
      vec4u(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w),
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(lhs: T, rhs: T) => T>,

  sub: {
    [TypeCatalog.v2f]: (a: wgsl.v2f, b: wgsl.v2f) =>
      vec2f(a.x - b.x, a.y - b.y),
    [TypeCatalog.v2h]: (a: wgsl.v2h, b: wgsl.v2h) =>
      vec2h(a.x - b.x, a.y - b.y),
    [TypeCatalog.v2i]: (a: wgsl.v2i, b: wgsl.v2i) =>
      vec2i(a.x - b.x, a.y - b.y),
    [TypeCatalog.v2u]: (a: wgsl.v2u, b: wgsl.v2u) =>
      vec2u(a.x - b.x, a.y - b.y),

    [TypeCatalog.v3f]: (a: wgsl.v3f, b: wgsl.v3f) =>
      vec3f(a.x - b.x, a.y - b.y, a.z - b.z),
    [TypeCatalog.v3h]: (a: wgsl.v3h, b: wgsl.v3h) =>
      vec3h(a.x - b.x, a.y - b.y, a.z - b.z),
    [TypeCatalog.v3i]: (a: wgsl.v3i, b: wgsl.v3i) =>
      vec3i(a.x - b.x, a.y - b.y, a.z - b.z),
    [TypeCatalog.v3u]: (a: wgsl.v3u, b: wgsl.v3u) =>
      vec3u(a.x - b.x, a.y - b.y, a.z - b.z),

    [TypeCatalog.v4f]: (a: wgsl.v4f, b: wgsl.v4f) =>
      vec4f(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    [TypeCatalog.v4h]: (a: wgsl.v4h, b: wgsl.v4h) =>
      vec4h(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    [TypeCatalog.v4i]: (a: wgsl.v4i, b: wgsl.v4i) =>
      vec4i(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    [TypeCatalog.v4u]: (a: wgsl.v4u, b: wgsl.v4u) =>
      vec4u(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(lhs: T, rhs: T) => T>,

  mulSxV: {
    [TypeCatalog.v2f]: (s: number, v: wgsl.v2f) => vec2f(s * v.x, s * v.y),
    [TypeCatalog.v2h]: (s: number, v: wgsl.v2h) => vec2h(s * v.x, s * v.y),
    [TypeCatalog.v2i]: (s: number, v: wgsl.v2i) => vec2i(s * v.x, s * v.y),
    [TypeCatalog.v2u]: (s: number, v: wgsl.v2u) => vec2u(s * v.x, s * v.y),

    [TypeCatalog.v3f]: (s: number, v: wgsl.v3f) =>
      vec3f(s * v.x, s * v.y, s * v.z),
    [TypeCatalog.v3h]: (s: number, v: wgsl.v3h) =>
      vec3h(s * v.x, s * v.y, s * v.z),
    [TypeCatalog.v3i]: (s: number, v: wgsl.v3i) =>
      vec3i(s * v.x, s * v.y, s * v.z),
    [TypeCatalog.v3u]: (s: number, v: wgsl.v3u) =>
      vec3u(s * v.x, s * v.y, s * v.z),

    [TypeCatalog.v4f]: (s: number, v: wgsl.v4f) =>
      vec4f(s * v.x, s * v.y, s * v.z, s * v.w),
    [TypeCatalog.v4h]: (s: number, v: wgsl.v4h) =>
      vec4h(s * v.x, s * v.y, s * v.z, s * v.w),
    [TypeCatalog.v4i]: (s: number, v: wgsl.v4i) =>
      vec4i(s * v.x, s * v.y, s * v.z, s * v.w),
    [TypeCatalog.v4u]: (s: number, v: wgsl.v4u) =>
      vec4u(s * v.x, s * v.y, s * v.z, s * v.w),

    [TypeCatalog.m2x2f]: (s: number, m: wgsl.m2x2f) => {
      const m_ = m.columns as [wgsl.v2f, wgsl.v2f];
      return mat2x2f(s * m_[0].x, s * m_[0].y, s * m_[1].x, s * m_[1].y);
    },

    [TypeCatalog.m3x3f]: (s: number, m: wgsl.m3x3f) => {
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

    [TypeCatalog.m4x4f]: (s: number, m: wgsl.m4x4f) => {
      const m_ = m.columns as [wgsl.v4f, wgsl.v4f, wgsl.v4f, wgsl.v4f];
      return mat4x4f(
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
    wgsl.VecInstanceTypeID | wgsl.MatInstanceTypeID,
    <T extends vBase | wgsl.AnyMatInstance>(s: number, v: T) => T
  >,

  mulVxV: {
    [TypeCatalog.v2f]: (a: wgsl.v2f, b: wgsl.v2f) =>
      vec2f(a.x * b.x, a.y * b.y),
    [TypeCatalog.v2h]: (a: wgsl.v2h, b: wgsl.v2h) =>
      vec2h(a.x * b.x, a.y * b.y),
    [TypeCatalog.v2i]: (a: wgsl.v2i, b: wgsl.v2i) =>
      vec2i(a.x * b.x, a.y * b.y),
    [TypeCatalog.v2u]: (a: wgsl.v2u, b: wgsl.v2u) =>
      vec2u(a.x * b.x, a.y * b.y),

    [TypeCatalog.v3f]: (a: wgsl.v3f, b: wgsl.v3f) =>
      vec3f(a.x * b.x, a.y * b.y, a.z * b.z),
    [TypeCatalog.v3h]: (a: wgsl.v3h, b: wgsl.v3h) =>
      vec3h(a.x * b.x, a.y * b.y, a.z * b.z),
    [TypeCatalog.v3i]: (a: wgsl.v3i, b: wgsl.v3i) =>
      vec3i(a.x * b.x, a.y * b.y, a.z * b.z),
    [TypeCatalog.v3u]: (a: wgsl.v3u, b: wgsl.v3u) =>
      vec3u(a.x * b.x, a.y * b.y, a.z * b.z),

    [TypeCatalog.v4f]: (a: wgsl.v4f, b: wgsl.v4f) =>
      vec4f(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w),
    [TypeCatalog.v4h]: (a: wgsl.v4h, b: wgsl.v4h) =>
      vec4h(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w),
    [TypeCatalog.v4i]: (a: wgsl.v4i, b: wgsl.v4i) =>
      vec4i(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w),
    [TypeCatalog.v4u]: (a: wgsl.v4u, b: wgsl.v4u) =>
      vec4u(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w),

    [TypeCatalog.m2x2f]: (a: wgsl.m2x2f, b: wgsl.m2x2f) => {
      const a_ = a.columns as [wgsl.v2f, wgsl.v2f];
      const b_ = b.columns as [wgsl.v2f, wgsl.v2f];

      return mat2x2f(
        a_[0].x * b_[0].x + a_[1].x * b_[0].y,
        a_[0].y * b_[0].x + a_[1].y * b_[0].y,

        a_[0].x * b_[1].x + a_[1].x * b_[1].y,
        a_[0].y * b_[1].x + a_[1].y * b_[1].y,
      );
    },

    [TypeCatalog.m3x3f]: (a: wgsl.m3x3f, b: wgsl.m3x3f) => {
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

    [TypeCatalog.m4x4f]: (a: wgsl.m4x4f, b: wgsl.m4x4f) => {
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
    wgsl.VecInstanceTypeID | wgsl.MatInstanceTypeID,
    <T extends vBase | wgsl.AnyMatInstance>(lhs: T, rhs: T) => T
  >,

  mulMxV: {
    [TypeCatalog.m2x2f]: (m: wgsl.m2x2f, v: wgsl.v2f) => {
      const m_ = m.columns as [wgsl.v2f, wgsl.v2f];
      return vec2f(
        m_[0].x * v.x + m_[1].x * v.y,
        m_[0].y * v.x + m_[1].y * v.y,
      );
    },

    [TypeCatalog.m3x3f]: (m: wgsl.m3x3f, v: wgsl.v3f) => {
      const m_ = m.columns as [wgsl.v3f, wgsl.v3f, wgsl.v3f];
      return vec3f(
        m_[0].x * v.x + m_[1].x * v.y + m_[2].x * v.z,
        m_[0].y * v.x + m_[1].y * v.y + m_[2].y * v.z,
        m_[0].z * v.x + m_[1].z * v.y + m_[2].z * v.z,
      );
    },

    [TypeCatalog.m4x4f]: (m: wgsl.m4x4f, v: wgsl.v4f) => {
      const m_ = m.columns as [wgsl.v4f, wgsl.v4f, wgsl.v4f, wgsl.v4f];
      return vec4f(
        m_[0].x * v.x + m_[1].x * v.y + m_[2].x * v.z + m_[3].x * v.w,
        m_[0].y * v.x + m_[1].y * v.y + m_[2].y * v.z + m_[3].y * v.w,
        m_[0].z * v.x + m_[1].z * v.y + m_[2].z * v.z + m_[3].z * v.w,
        m_[0].w * v.x + m_[1].w * v.y + m_[2].w * v.z + m_[3].w * v.w,
      );
    },
  } as Record<
    wgsl.MatInstanceTypeID,
    <T extends wgsl.AnyMatInstance>(
      m: T,
      v: wgsl.vBaseForMat<T>,
    ) => wgsl.vBaseForMat<T>
  >,

  mulVxM: {
    [TypeCatalog.m2x2f]: (v: wgsl.v2f, m: wgsl.m2x2f) => {
      const m_ = m.columns as [wgsl.v2f, wgsl.v2f];
      return vec2f(
        v.x * m_[0].x + v.y * m_[0].y,
        v.x * m_[1].x + v.y * m_[1].y,
      );
    },

    [TypeCatalog.m3x3f]: (v: wgsl.v3f, m: wgsl.m3x3f) => {
      const m_ = m.columns as [wgsl.v3f, wgsl.v3f, wgsl.v3f];
      return vec3f(
        v.x * m_[0].x + v.y * m_[0].y + v.z * m_[0].z,
        v.x * m_[1].x + v.y * m_[1].y + v.z * m_[1].z,
        v.x * m_[2].x + v.y * m_[2].y + v.z * m_[2].z,
      );
    },

    [TypeCatalog.m4x4f]: (v: wgsl.v4f, m: wgsl.m4x4f) => {
      const m_ = m.columns as [wgsl.v4f, wgsl.v4f, wgsl.v4f, wgsl.v4f];
      return vec4f(
        v.x * m_[0].x + v.y * m_[0].y + v.z * m_[0].z + v.w * m_[0].w,
        v.x * m_[1].x + v.y * m_[1].y + v.z * m_[1].z + v.w * m_[1].w,
        v.x * m_[2].x + v.y * m_[2].y + v.z * m_[2].z + v.w * m_[2].w,
        v.x * m_[3].x + v.y * m_[3].y + v.z * m_[3].z + v.w * m_[3].w,
      );
    },
  } as Record<
    wgsl.MatInstanceTypeID,
    <T extends wgsl.AnyMatInstance>(
      v: wgsl.vBaseForMat<T>,
      m: T,
    ) => wgsl.vBaseForMat<T>
  >,

  dot: {
    [TypeCatalog.v2f]: dotVec2,
    [TypeCatalog.v2h]: dotVec2,
    [TypeCatalog.v2i]: dotVec2,
    [TypeCatalog.v2u]: dotVec2,
    [TypeCatalog.v3f]: dotVec3,
    [TypeCatalog.v3h]: dotVec3,
    [TypeCatalog.v3i]: dotVec3,
    [TypeCatalog.v3u]: dotVec3,
    [TypeCatalog.v4f]: dotVec4,
    [TypeCatalog.v4h]: dotVec4,
    [TypeCatalog.v4i]: dotVec4,
    [TypeCatalog.v4u]: dotVec4,
  } as Record<
    wgsl.VecInstanceTypeID,
    <T extends vBase>(lhs: T, rhs: T) => number
  >,

  normalize: {
    [TypeCatalog.v2f]: (v: wgsl.v2f) => {
      const len = lengthVec2(v);
      return vec2f(v.x / len, v.y / len);
    },
    [TypeCatalog.v2h]: (v: wgsl.v2h) => {
      const len = lengthVec2(v);
      return vec2h(v.x / len, v.y / len);
    },
    [TypeCatalog.v2i]: (v: wgsl.v2i) => {
      const len = lengthVec2(v);
      return vec2i(v.x / len, v.y / len);
    },
    [TypeCatalog.v2u]: (v: wgsl.v2u) => {
      const len = lengthVec2(v);
      return vec2u(v.x / len, v.y / len);
    },

    [TypeCatalog.v3f]: (v: wgsl.v3f) => {
      const len = lengthVec3(v);
      return vec3f(v.x / len, v.y / len, v.z / len);
    },
    [TypeCatalog.v3h]: (v: wgsl.v3h) => {
      const len = lengthVec3(v);
      return vec3h(v.x / len, v.y / len, v.z / len);
    },
    [TypeCatalog.v3i]: (v: wgsl.v3i) => {
      const len = lengthVec3(v);
      return vec3i(v.x / len, v.y / len, v.z / len);
    },
    [TypeCatalog.v3u]: (v: wgsl.v3u) => {
      const len = lengthVec3(v);
      return vec3u(v.x / len, v.y / len, v.z / len);
    },

    [TypeCatalog.v4f]: (v: wgsl.v4f) => {
      const len = lengthVec4(v);
      return vec4f(v.x / len, v.y / len, v.z / len, v.w / len);
    },
    [TypeCatalog.v4h]: (v: wgsl.v4h) => {
      const len = lengthVec4(v);
      return vec4h(v.x / len, v.y / len, v.z / len, v.w / len);
    },
    [TypeCatalog.v4i]: (v: wgsl.v4i) => {
      const len = lengthVec4(v);
      return vec4i(v.x / len, v.y / len, v.z / len, v.w / len);
    },
    [TypeCatalog.v4u]: (v: wgsl.v4u) => {
      const len = lengthVec4(v);
      return vec4u(v.x / len, v.y / len, v.z / len, v.w / len);
    },
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(v: T) => T>,

  cross: {
    [TypeCatalog.v3f]: (a: wgsl.v3f, b: wgsl.v3f) => {
      return vec3f(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
    [TypeCatalog.v3h]: (a: wgsl.v3h, b: wgsl.v3h) => {
      return vec3h(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
    [TypeCatalog.v3i]: (a: wgsl.v3i, b: wgsl.v3i) => {
      return vec3i(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
    [TypeCatalog.v3u]: (a: wgsl.v3u, b: wgsl.v3u) => {
      return vec3u(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    },
  } as Record<
    TypeCatalog['v3f'] | TypeCatalog['v3i'] | TypeCatalog['v3u'],
    <T extends wgsl.v3f | wgsl.v3i | wgsl.v3u>(a: T, b: T) => T
  >,

  floor: {
    [TypeCatalog.v2f]: unary2f(Math.floor),
    [TypeCatalog.v2h]: unary2h(Math.floor),
    [TypeCatalog.v2i]: unary2i(Math.floor),
    [TypeCatalog.v2u]: unary2u(Math.floor),

    [TypeCatalog.v3f]: unary3f(Math.floor),
    [TypeCatalog.v3h]: unary3h(Math.floor),
    [TypeCatalog.v3i]: unary3i(Math.floor),
    [TypeCatalog.v3u]: unary3u(Math.floor),

    [TypeCatalog.v4f]: unary4f(Math.floor),
    [TypeCatalog.v4h]: unary4h(Math.floor),
    [TypeCatalog.v4i]: unary4i(Math.floor),
    [TypeCatalog.v4u]: unary4u(Math.floor),
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(v: T) => T>,

  max: {
    [TypeCatalog.v2f]: binaryComponentWise2f(Math.max),
    [TypeCatalog.v2h]: binaryComponentWise2h(Math.max),
    [TypeCatalog.v2i]: binaryComponentWise2i(Math.max),
    [TypeCatalog.v2u]: binaryComponentWise2u(Math.max),

    [TypeCatalog.v3f]: binaryComponentWise3f(Math.max),
    [TypeCatalog.v3h]: binaryComponentWise3h(Math.max),
    [TypeCatalog.v3i]: binaryComponentWise3i(Math.max),
    [TypeCatalog.v3u]: binaryComponentWise3u(Math.max),

    [TypeCatalog.v4f]: binaryComponentWise4f(Math.max),
    [TypeCatalog.v4h]: binaryComponentWise4h(Math.max),
    [TypeCatalog.v4i]: binaryComponentWise4i(Math.max),
    [TypeCatalog.v4u]: binaryComponentWise4u(Math.max),
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(a: T, b: T) => T>,

  min: {
    [TypeCatalog.v2f]: binaryComponentWise2f(Math.min),
    [TypeCatalog.v2h]: binaryComponentWise2h(Math.min),
    [TypeCatalog.v2i]: binaryComponentWise2i(Math.min),
    [TypeCatalog.v2u]: binaryComponentWise2u(Math.min),

    [TypeCatalog.v3f]: binaryComponentWise3f(Math.min),
    [TypeCatalog.v3h]: binaryComponentWise3h(Math.min),
    [TypeCatalog.v3i]: binaryComponentWise3i(Math.min),
    [TypeCatalog.v3u]: binaryComponentWise3u(Math.min),

    [TypeCatalog.v4f]: binaryComponentWise4f(Math.min),
    [TypeCatalog.v4h]: binaryComponentWise4h(Math.min),
    [TypeCatalog.v4i]: binaryComponentWise4i(Math.min),
    [TypeCatalog.v4u]: binaryComponentWise4u(Math.min),
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(a: T, b: T) => T>,

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
    [TypeCatalog.v2f]: (e1: wgsl.v2f, e2: wgsl.v2f, e3: wgsl.v2f | number) => {
      if (typeof e3 === 'number') {
        return vec2f(e1.x * (1 - e3) + e2.x * e3, e1.y * (1 - e3) + e2.y * e3);
      }
      return vec2f(
        e1.x * (1 - e3.x) + e2.x * e3.x,
        e1.y * (1 - e3.y) + e2.y * e3.y,
      );
    },
    [TypeCatalog.v2h]: (e1: wgsl.v2h, e2: wgsl.v2h, e3: wgsl.v2h | number) => {
      if (typeof e3 === 'number') {
        return vec2h(e1.x * (1 - e3) + e2.x * e3, e1.y * (1 - e3) + e2.y * e3);
      }
      return vec2h(
        e1.x * (1 - e3.x) + e2.x * e3.x,
        e1.y * (1 - e3.y) + e2.y * e3.y,
      );
    },

    [TypeCatalog.v3f]: (e1: wgsl.v3f, e2: wgsl.v3f, e3: wgsl.v3f | number) => {
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
    [TypeCatalog.v3h]: (e1: wgsl.v3h, e2: wgsl.v3h, e3: wgsl.v3h | number) => {
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

    [TypeCatalog.v4f]: (e1: wgsl.v4f, e2: wgsl.v4f, e3: wgsl.v4f | number) => {
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
    [TypeCatalog.v4h]: (e1: wgsl.v4h, e2: wgsl.v4h, e3: wgsl.v4h | number) => {
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
    | TypeCatalog['v2f']
    | TypeCatalog['v3f']
    | TypeCatalog['v4f']
    | TypeCatalog['v2h']
    | TypeCatalog['v3h']
    | TypeCatalog['v4h'],
    <T extends wgsl.v2f | wgsl.v3f | wgsl.v4f | wgsl.v2h | wgsl.v3h | wgsl.v4h>(
      a: T,
      b: T,
      c: T | number,
    ) => T
  >,

  sin: {
    [TypeCatalog.v2f]: unary2f(Math.sin),
    [TypeCatalog.v2h]: unary2h(Math.sin),
    [TypeCatalog.v2i]: unary2i(Math.sin),
    [TypeCatalog.v2u]: unary2u(Math.sin),

    [TypeCatalog.v3f]: unary3f(Math.sin),
    [TypeCatalog.v3h]: unary3h(Math.sin),
    [TypeCatalog.v3i]: unary3i(Math.sin),
    [TypeCatalog.v3u]: unary3u(Math.sin),

    [TypeCatalog.v4f]: unary4f(Math.sin),
    [TypeCatalog.v4h]: unary4h(Math.sin),
    [TypeCatalog.v4i]: unary4i(Math.sin),
    [TypeCatalog.v4u]: unary4u(Math.sin),
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(v: T) => T>,

  cos: {
    [TypeCatalog.v2f]: unary2f(Math.cos),
    [TypeCatalog.v2h]: unary2h(Math.cos),
    [TypeCatalog.v2i]: unary2i(Math.cos),
    [TypeCatalog.v2u]: unary2u(Math.cos),

    [TypeCatalog.v3f]: unary3f(Math.cos),
    [TypeCatalog.v3h]: unary3h(Math.cos),
    [TypeCatalog.v3i]: unary3i(Math.cos),
    [TypeCatalog.v3u]: unary3u(Math.cos),

    [TypeCatalog.v4f]: unary4f(Math.cos),
    [TypeCatalog.v4h]: unary4h(Math.cos),
    [TypeCatalog.v4i]: unary4i(Math.cos),
    [TypeCatalog.v4u]: unary4u(Math.cos),
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(v: T) => T>,

  exp: {
    [TypeCatalog.v2f]: unary2f(Math.exp),
    [TypeCatalog.v2h]: unary2h(Math.exp),
    [TypeCatalog.v2i]: unary2i(Math.exp),
    [TypeCatalog.v2u]: unary2u(Math.exp),

    [TypeCatalog.v3f]: unary3f(Math.exp),
    [TypeCatalog.v3h]: unary3h(Math.exp),
    [TypeCatalog.v3i]: unary3i(Math.exp),
    [TypeCatalog.v3u]: unary3u(Math.exp),

    [TypeCatalog.v4f]: unary4f(Math.exp),
    [TypeCatalog.v4h]: unary4h(Math.exp),
    [TypeCatalog.v4i]: unary4i(Math.exp),
    [TypeCatalog.v4u]: unary4u(Math.exp),
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(v: T) => T>,

  fract: {
    [TypeCatalog.v2f]: unary2f((value) => value - Math.floor(value)),
    [TypeCatalog.v2h]: unary2h((value) => value - Math.floor(value)),
    [TypeCatalog.v2i]: unary2i((value) => value - Math.floor(value)),
    [TypeCatalog.v2u]: unary2u((value) => value - Math.floor(value)),

    [TypeCatalog.v3f]: unary3f((value) => value - Math.floor(value)),
    [TypeCatalog.v3h]: unary3h((value) => value - Math.floor(value)),
    [TypeCatalog.v3i]: unary3i((value) => value - Math.floor(value)),
    [TypeCatalog.v3u]: unary3u((value) => value - Math.floor(value)),

    [TypeCatalog.v4f]: unary4f((value) => value - Math.floor(value)),
    [TypeCatalog.v4h]: unary4h((value) => value - Math.floor(value)),
    [TypeCatalog.v4i]: unary4i((value) => value - Math.floor(value)),
    [TypeCatalog.v4u]: unary4u((value) => value - Math.floor(value)),
  } as Record<wgsl.VecInstanceTypeID, <T extends vBase>(v: T) => T>,

  isCloseToZero: {
    [TypeCatalog.v2f]: (v: wgsl.v2f, n: number) =>
      Math.abs(v.x) <= n && Math.abs(v.y) <= n,
    [TypeCatalog.v2h]: (v: wgsl.v2h, n: number) =>
      Math.abs(v.x) <= n && Math.abs(v.y) <= n,

    [TypeCatalog.v3f]: (v: wgsl.v3f, n: number) =>
      Math.abs(v.x) <= n && Math.abs(v.y) <= n && Math.abs(v.z) <= n,
    [TypeCatalog.v3h]: (v: wgsl.v3h, n: number) =>
      Math.abs(v.x) <= n && Math.abs(v.y) <= n && Math.abs(v.z) <= n,

    [TypeCatalog.v4f]: (v: wgsl.v4f, n: number) =>
      Math.abs(v.x) <= n &&
      Math.abs(v.y) <= n &&
      Math.abs(v.z) <= n &&
      Math.abs(v.w) <= n,
    [TypeCatalog.v4h]: (v: wgsl.v4h, n: number) =>
      Math.abs(v.x) <= n &&
      Math.abs(v.y) <= n &&
      Math.abs(v.z) <= n &&
      Math.abs(v.w) <= n,
  } as Record<
    wgsl.VecInstanceTypeID,
    <T extends vBase>(v: T, n: number) => boolean
  >,
};
