import { mat2x2f, mat3x3f, mat4x4f } from './matrix.ts';
import {
  bitcastU32toF32Impl,
  bitcastU32toI32Impl,
  clamp,
  divInteger,
  smoothstepScalar,
} from './numberOps.ts';
import * as vectorConstructors from './vector.ts';
import type * as wgsl from './wgslTypes.ts';
import type { VecKind } from './wgslTypes.ts';

type vBase = { kind: VecKind };
type mBase = { kind: MatKind };
type v2 = wgsl.v2f | wgsl.v2h | wgsl.v2i | wgsl.v2u;
type v3 = wgsl.v3f | wgsl.v3h | wgsl.v3i | wgsl.v3u;
type v4 = wgsl.v4f | wgsl.v4h | wgsl.v4i | wgsl.v4u;

type MatKind = 'mat2x2f' | 'mat3x3f' | 'mat4x4f';

const vec2b = vectorConstructors.vec2b;
const vec2f = vectorConstructors.vec2f;
const vec2h = vectorConstructors.vec2h;
const vec2i = vectorConstructors.vec2i;
const vec2u = vectorConstructors.vec2u;
const vec3b = vectorConstructors.vec3b;
const vec3f = vectorConstructors.vec3f;
const vec3h = vectorConstructors.vec3h;
const vec3i = vectorConstructors.vec3i;
const vec3u = vectorConstructors.vec3u;
const vec4b = vectorConstructors.vec4b;
const vec4f = vectorConstructors.vec4f;
const vec4h = vectorConstructors.vec4h;
const vec4i = vectorConstructors.vec4i;
const vec4u = vectorConstructors.vec4u;

const lengthVec2 = (v: v2) => Math.sqrt(v.x ** 2 + v.y ** 2);
const lengthVec3 = (v: v3) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
const lengthVec4 = (v: v4) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2 + v.w ** 2);

const dotVec2 = (lhs: v2, rhs: v2) => lhs.x * rhs.x + lhs.y * rhs.y;
const dotVec3 = (lhs: v3, rhs: v3) => lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z;
const dotVec4 = (lhs: v4, rhs: v4) => lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w;

type UnaryOp = (a: number) => number;
type BinaryOp = (a: number, b: number) => number;

const unary2f = (op: UnaryOp) => (a: wgsl.v2f) => vec2f(op(a.x), op(a.y));
const unary2h = (op: UnaryOp) => (a: wgsl.v2h) => vec2h(op(a.x), op(a.y));
const unary2i = (op: UnaryOp) => (a: wgsl.v2i) => vec2i(op(a.x), op(a.y));
const unary2u = (op: UnaryOp) => (a: wgsl.v2u) => vec2u(op(a.x), op(a.y));

const unary3f = (op: UnaryOp) => (a: wgsl.v3f) => vec3f(op(a.x), op(a.y), op(a.z));

const unary3h = (op: UnaryOp) => (a: wgsl.v3h) => vec3h(op(a.x), op(a.y), op(a.z));

const unary3i = (op: UnaryOp) => (a: wgsl.v3i) => vec3i(op(a.x), op(a.y), op(a.z));

const unary3u = (op: UnaryOp) => (a: wgsl.v3u) => vec3u(op(a.x), op(a.y), op(a.z));

const unary4f = (op: UnaryOp) => (a: wgsl.v4f) => vec4f(op(a.x), op(a.y), op(a.z), op(a.w));

const unary4h = (op: UnaryOp) => (a: wgsl.v4h) => vec4h(op(a.x), op(a.y), op(a.z), op(a.w));

const unary4i = (op: UnaryOp) => (a: wgsl.v4i) => vec4i(op(a.x), op(a.y), op(a.z), op(a.w));

const unary4u = (op: UnaryOp) => (a: wgsl.v4u) => vec4u(op(a.x), op(a.y), op(a.z), op(a.w));

const unary2x2f = (op: UnaryOp) => (a: wgsl.m2x2f) => {
  const a_ = a.columns as [wgsl.v2f, wgsl.v2f];
  return mat2x2f(unary2f(op)(a_[0]), unary2f(op)(a_[1]));
};

const unary3x3f = (op: UnaryOp) => (a: wgsl.m3x3f) => {
  const a_ = a.columns as [wgsl.v3f, wgsl.v3f, wgsl.v3f];
  return mat3x3f(unary3f(op)(a_[0]), unary3f(op)(a_[1]), unary3f(op)(a_[2]));
};

const unary4x4f = (op: UnaryOp) => (a: wgsl.m4x4f) => {
  const a_ = a.columns as [wgsl.v4f, wgsl.v4f, wgsl.v4f, wgsl.v4f];
  return mat4x4f(unary4f(op)(a_[0]), unary4f(op)(a_[1]), unary4f(op)(a_[2]), unary4f(op)(a_[3]));
};

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

const binaryComponentWise2x2f = (op: BinaryOp) => (a: wgsl.m2x2f, b: wgsl.m2x2f) => {
  const a_ = a.columns as [wgsl.v2f, wgsl.v2f];
  const b_ = b.columns as [wgsl.v2f, wgsl.v2f];
  return mat2x2f(binaryComponentWise2f(op)(a_[0], b_[0]), binaryComponentWise2f(op)(a_[1], b_[1]));
};

const binaryComponentWise3x3f = (op: BinaryOp) => (a: wgsl.m3x3f, b: wgsl.m3x3f) => {
  const a_ = a.columns as [wgsl.v3f, wgsl.v3f, wgsl.v3f];
  const b_ = b.columns as [wgsl.v3f, wgsl.v3f, wgsl.v3f];
  return mat3x3f(
    binaryComponentWise3f(op)(a_[0], b_[0]),
    binaryComponentWise3f(op)(a_[1], b_[1]),
    binaryComponentWise3f(op)(a_[2], b_[2]),
  );
};

const binaryComponentWise4x4f = (op: BinaryOp) => (a: wgsl.m4x4f, b: wgsl.m4x4f) => {
  const a_ = a.columns as [wgsl.v4f, wgsl.v4f, wgsl.v4f, wgsl.v4f];
  const b_ = b.columns as [wgsl.v4f, wgsl.v4f, wgsl.v4f, wgsl.v4f];
  return mat4x4f(
    binaryComponentWise4f(op)(a_[0], b_[0]),
    binaryComponentWise4f(op)(a_[1], b_[1]),
    binaryComponentWise4f(op)(a_[2], b_[2]),
    binaryComponentWise4f(op)(a_[3], b_[3]),
  );
};

type TernaryOp = (a: number, b: number, c: number) => number;

const ternaryComponentWise2f = (op: TernaryOp) => (a: wgsl.v2f, b: wgsl.v2f, c: wgsl.v2f) =>
  vec2f(op(a.x, b.x, c.x), op(a.y, b.y, c.y));

const ternaryComponentWise2h = (op: TernaryOp) => (a: wgsl.v2h, b: wgsl.v2h, c: wgsl.v2h) =>
  vec2h(op(a.x, b.x, c.x), op(a.y, b.y, c.y));

const ternaryComponentWise3f = (op: TernaryOp) => (a: wgsl.v3f, b: wgsl.v3f, c: wgsl.v3f) =>
  vec3f(op(a.x, b.x, c.x), op(a.y, b.y, c.y), op(a.z, b.z, c.z));

const ternaryComponentWise3h = (op: TernaryOp) => (a: wgsl.v3h, b: wgsl.v3h, c: wgsl.v3h) =>
  vec3h(op(a.x, b.x, c.x), op(a.y, b.y, c.y), op(a.z, b.z, c.z));

const ternaryComponentWise4f = (op: TernaryOp) => (a: wgsl.v4f, b: wgsl.v4f, c: wgsl.v4f) =>
  vec4f(op(a.x, b.x, c.x), op(a.y, b.y, c.y), op(a.z, b.z, c.z), op(a.w, b.w, c.w));

const ternaryComponentWise4h = (op: TernaryOp) => (a: wgsl.v4h, b: wgsl.v4h, c: wgsl.v4h) =>
  vec4h(op(a.x, b.x, c.x), op(a.y, b.y, c.y), op(a.z, b.z, c.z), op(a.w, b.w, c.w));

export const VectorOps = {
  eq: {
    vec2f: (e1: wgsl.v2f, e2: wgsl.v2f) => vec2b(e1.x === e2.x, e1.y === e2.y),
    vec2h: (e1: wgsl.v2h, e2: wgsl.v2h) => vec2b(e1.x === e2.x, e1.y === e2.y),
    vec2i: (e1: wgsl.v2i, e2: wgsl.v2i) => vec2b(e1.x === e2.x, e1.y === e2.y),
    vec2u: (e1: wgsl.v2u, e2: wgsl.v2u) => vec2b(e1.x === e2.x, e1.y === e2.y),
    'vec2<bool>': (e1: wgsl.v2b, e2: wgsl.v2b) => vec2b(e1.x === e2.x, e1.y === e2.y),

    vec3f: (e1: wgsl.v3f, e2: wgsl.v3f) => vec3b(e1.x === e2.x, e1.y === e2.y, e1.z === e2.z),
    vec3h: (e1: wgsl.v3h, e2: wgsl.v3h) => vec3b(e1.x === e2.x, e1.y === e2.y, e1.z === e2.z),
    vec3i: (e1: wgsl.v3i, e2: wgsl.v3i) => vec3b(e1.x === e2.x, e1.y === e2.y, e1.z === e2.z),
    vec3u: (e1: wgsl.v3u, e2: wgsl.v3u) => vec3b(e1.x === e2.x, e1.y === e2.y, e1.z === e2.z),
    'vec3<bool>': (e1: wgsl.v3b, e2: wgsl.v3b) =>
      vec3b(e1.x === e2.x, e1.y === e2.y, e1.z === e2.z),

    vec4f: (e1: wgsl.v4f, e2: wgsl.v4f) =>
      vec4b(e1.x === e2.x, e1.y === e2.y, e1.z === e2.z, e1.w === e2.w),
    vec4h: (e1: wgsl.v4h, e2: wgsl.v4h) =>
      vec4b(e1.x === e2.x, e1.y === e2.y, e1.z === e2.z, e1.w === e2.w),
    vec4i: (e1: wgsl.v4i, e2: wgsl.v4i) =>
      vec4b(e1.x === e2.x, e1.y === e2.y, e1.z === e2.z, e1.w === e2.w),
    vec4u: (e1: wgsl.v4u, e2: wgsl.v4u) =>
      vec4b(e1.x === e2.x, e1.y === e2.y, e1.z === e2.z, e1.w === e2.w),
    'vec4<bool>': (e1: wgsl.v4b, e2: wgsl.v4b) =>
      vec4b(e1.x === e2.x, e1.y === e2.y, e1.z === e2.z, e1.w === e2.w),
  } as Record<
    VecKind,
    <T extends wgsl.AnyVecInstance>(
      e1: T,
      e2: T,
    ) => T extends wgsl.AnyVec2Instance
      ? wgsl.v2b
      : T extends wgsl.AnyVec3Instance
        ? wgsl.v3b
        : wgsl.v4b
  >,

  lt: {
    vec2f: (e1: wgsl.v2f, e2: wgsl.v2f) => vec2b(e1.x < e2.x, e1.y < e2.y),
    vec2h: (e1: wgsl.v2h, e2: wgsl.v2h) => vec2b(e1.x < e2.x, e1.y < e2.y),
    vec2i: (e1: wgsl.v2i, e2: wgsl.v2i) => vec2b(e1.x < e2.x, e1.y < e2.y),
    vec2u: (e1: wgsl.v2u, e2: wgsl.v2u) => vec2b(e1.x < e2.x, e1.y < e2.y),

    vec3f: (e1: wgsl.v3f, e2: wgsl.v3f) => vec3b(e1.x < e2.x, e1.y < e2.y, e1.z < e2.z),
    vec3h: (e1: wgsl.v3h, e2: wgsl.v3h) => vec3b(e1.x < e2.x, e1.y < e2.y, e1.z < e2.z),
    vec3i: (e1: wgsl.v3i, e2: wgsl.v3i) => vec3b(e1.x < e2.x, e1.y < e2.y, e1.z < e2.z),
    vec3u: (e1: wgsl.v3u, e2: wgsl.v3u) => vec3b(e1.x < e2.x, e1.y < e2.y, e1.z < e2.z),

    vec4f: (e1: wgsl.v4f, e2: wgsl.v4f) =>
      vec4b(e1.x < e2.x, e1.y < e2.y, e1.z < e2.z, e1.w < e2.w),
    vec4h: (e1: wgsl.v4h, e2: wgsl.v4h) =>
      vec4b(e1.x < e2.x, e1.y < e2.y, e1.z < e2.z, e1.w < e2.w),
    vec4i: (e1: wgsl.v4i, e2: wgsl.v4i) =>
      vec4b(e1.x < e2.x, e1.y < e2.y, e1.z < e2.z, e1.w < e2.w),
    vec4u: (e1: wgsl.v4u, e2: wgsl.v4u) =>
      vec4b(e1.x < e2.x, e1.y < e2.y, e1.z < e2.z, e1.w < e2.w),
  } as Record<
    VecKind,
    <T extends wgsl.AnyNumericVecInstance>(
      e1: T,
      e2: T,
    ) => T extends wgsl.AnyVec2Instance
      ? wgsl.v2b
      : T extends wgsl.AnyVec3Instance
        ? wgsl.v3b
        : wgsl.v4b
  >,

  or: {
    'vec2<bool>': (e1: wgsl.v2b, e2: wgsl.v2b) => vec2b(e1.x || e2.x, e1.y || e2.y),
    'vec3<bool>': (e1: wgsl.v3b, e2: wgsl.v3b) => vec3b(e1.x || e2.x, e1.y || e2.y, e1.z || e2.z),
    'vec4<bool>': (e1: wgsl.v4b, e2: wgsl.v4b) =>
      vec4b(e1.x || e2.x, e1.y || e2.y, e1.z || e2.z, e1.w || e2.w),
  } as Record<VecKind, <T extends wgsl.AnyBooleanVecInstance>(e1: T, e2: T) => T>,

  all: {
    'vec2<bool>': (e: wgsl.v2b) => e.x && e.y,
    'vec3<bool>': (e: wgsl.v3b) => e.x && e.y && e.z,
    'vec4<bool>': (e: wgsl.v4b) => e.x && e.y && e.z && e.w,
  } as Record<VecKind, (v: wgsl.AnyBooleanVecInstance) => boolean>,

  abs: {
    vec2f: unary2f(Math.abs),
    vec2h: unary2h(Math.abs),
    vec2i: unary2i(Math.abs),
    vec2u: unary2u(Math.abs),

    vec3f: unary3f(Math.abs),
    vec3h: unary3h(Math.abs),
    vec3i: unary3i(Math.abs),
    vec3u: unary3u(Math.abs),

    vec4f: unary4f(Math.abs),
    vec4h: unary4h(Math.abs),
    vec4i: unary4i(Math.abs),
    vec4u: unary4u(Math.abs),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  atan2: {
    vec2f: binaryComponentWise2f(Math.atan2),
    vec2h: binaryComponentWise2h(Math.atan2),

    vec3f: binaryComponentWise3f(Math.atan2),
    vec3h: binaryComponentWise3h(Math.atan2),

    vec4f: binaryComponentWise4f(Math.atan2),
    vec4h: binaryComponentWise4h(Math.atan2),
  } as Record<VecKind, <T extends vBase>(a: T, b: T) => T>,

  acos: {
    vec2f: unary2f(Math.acos),
    vec2h: unary2h(Math.acos),
    vec2i: unary2i(Math.acos),
    vec2u: unary2u(Math.acos),

    vec3f: unary3f(Math.acos),
    vec3h: unary3h(Math.acos),
    vec3i: unary3i(Math.acos),
    vec3u: unary3u(Math.acos),

    vec4f: unary4f(Math.acos),
    vec4h: unary4h(Math.acos),
    vec4i: unary4i(Math.acos),
    vec4u: unary4u(Math.acos),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  acosh: {
    vec2f: unary2f(Math.acosh),
    vec2h: unary2h(Math.acosh),

    vec3f: unary3f(Math.acosh),
    vec3h: unary3h(Math.acosh),

    vec4f: unary4f(Math.acosh),
    vec4h: unary4h(Math.acosh),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  asin: {
    vec2f: unary2f(Math.asin),
    vec2h: unary2h(Math.asin),

    vec3f: unary3f(Math.asin),
    vec3h: unary3h(Math.asin),

    vec4f: unary4f(Math.asin),
    vec4h: unary4h(Math.asin),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  asinh: {
    vec2f: unary2f(Math.asinh),
    vec2h: unary2h(Math.asinh),

    vec3f: unary3f(Math.asinh),
    vec3h: unary3h(Math.asinh),

    vec4f: unary4f(Math.asinh),
    vec4h: unary4h(Math.asinh),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  atan: {
    vec2f: unary2f(Math.atan),
    vec2h: unary2h(Math.atan),

    vec3f: unary3f(Math.atan),
    vec3h: unary3h(Math.atan),

    vec4f: unary4f(Math.atan),
    vec4h: unary4h(Math.atan),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  atanh: {
    vec2f: unary2f(Math.atanh),
    vec2h: unary2h(Math.atanh),

    vec3f: unary3f(Math.atanh),
    vec3h: unary3h(Math.atanh),

    vec4f: unary4f(Math.atanh),
    vec4h: unary4h(Math.atanh),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  ceil: {
    vec2f: unary2f(Math.ceil),
    vec2h: unary2h(Math.ceil),

    vec3f: unary3f(Math.ceil),
    vec3h: unary3h(Math.ceil),

    vec4f: unary4f(Math.ceil),
    vec4h: unary4h(Math.ceil),
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
      vec3f(clamp(v.x, low.x, high.x), clamp(v.y, low.y, high.y), clamp(v.z, low.z, high.z)),
    vec3h: (v: wgsl.v3h, low: wgsl.v3h, high: wgsl.v3h) =>
      vec3h(clamp(v.x, low.x, high.x), clamp(v.y, low.y, high.y), clamp(v.z, low.z, high.z)),
    vec3i: (v: wgsl.v3i, low: wgsl.v3i, high: wgsl.v3f) =>
      vec3i(clamp(v.x, low.x, high.x), clamp(v.y, low.y, high.y), clamp(v.z, low.z, high.z)),
    vec3u: (v: wgsl.v3u, low: wgsl.v3u, high: wgsl.v3f) =>
      vec3u(clamp(v.x, low.x, high.x), clamp(v.y, low.y, high.y), clamp(v.z, low.z, high.z)),

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

    vec3f: lengthVec3,
    vec3h: lengthVec3,

    vec4f: lengthVec4,
    vec4h: lengthVec4,
  } as Record<VecKind, (v: vBase) => number>,

  add: {
    vec2f: binaryComponentWise2f((a, b) => a + b),
    vec2h: binaryComponentWise2h((a, b) => a + b),
    vec2i: binaryComponentWise2i((a, b) => a + b),
    vec2u: binaryComponentWise2u((a, b) => a + b),

    vec3f: binaryComponentWise3f((a, b) => a + b),
    vec3h: binaryComponentWise3h((a, b) => a + b),
    vec3i: binaryComponentWise3i((a, b) => a + b),
    vec3u: binaryComponentWise3u((a, b) => a + b),

    vec4f: binaryComponentWise4f((a, b) => a + b),
    vec4h: binaryComponentWise4h((a, b) => a + b),
    vec4i: binaryComponentWise4i((a, b) => a + b),
    vec4u: binaryComponentWise4u((a, b) => a + b),

    mat2x2f: binaryComponentWise2x2f((a, b) => a + b),
    mat3x3f: binaryComponentWise3x3f((a, b) => a + b),
    mat4x4f: binaryComponentWise4x4f((a, b) => a + b),
  } as Record<VecKind | MatKind, <T extends vBase | mBase>(lhs: T, rhs: T) => T>,

  smoothstep: {
    vec2f: ternaryComponentWise2f(smoothstepScalar),
    vec2h: ternaryComponentWise2h(smoothstepScalar),
    vec3f: ternaryComponentWise3f(smoothstepScalar),
    vec3h: ternaryComponentWise3h(smoothstepScalar),
    vec4f: ternaryComponentWise4f(smoothstepScalar),
    vec4h: ternaryComponentWise4h(smoothstepScalar),
  } as Record<
    VecKind,
    <T extends vBase>(
      edge0: T,
      edge1: T,
      x: T,
    ) => T extends wgsl.AnyVec2Instance
      ? wgsl.v2f
      : T extends wgsl.AnyVec3Instance
        ? wgsl.v3f
        : T extends wgsl.AnyVec4Instance
          ? wgsl.v4f
          : wgsl.AnyVecInstance
  >,

  addMixed: {
    vec2f: (a: wgsl.v2f, b: number) => unary2f((e) => e + b)(a),
    vec2h: (a: wgsl.v2h, b: number) => unary2h((e) => e + b)(a),
    vec2i: (a: wgsl.v2i, b: number) => unary2i((e) => e + b)(a),
    vec2u: (a: wgsl.v2u, b: number) => unary2u((e) => e + b)(a),

    vec3f: (a: wgsl.v3f, b: number) => unary3f((e) => e + b)(a),
    vec3h: (a: wgsl.v3h, b: number) => unary3h((e) => e + b)(a),
    vec3i: (a: wgsl.v3i, b: number) => unary3i((e) => e + b)(a),
    vec3u: (a: wgsl.v3u, b: number) => unary3u((e) => e + b)(a),

    vec4f: (a: wgsl.v4f, b: number) => unary4f((e) => e + b)(a),
    vec4h: (a: wgsl.v4h, b: number) => unary4h((e) => e + b)(a),
    vec4i: (a: wgsl.v4i, b: number) => unary4i((e) => e + b)(a),
    vec4u: (a: wgsl.v4u, b: number) => unary4u((e) => e + b)(a),

    mat2x2f: (a: wgsl.m2x2f, b: number) => unary2x2f((e) => e + b)(a),
    mat3x3f: (a: wgsl.m3x3f, b: number) => unary3x3f((e) => e + b)(a),
    mat4x4f: (a: wgsl.m4x4f, b: number) => unary4x4f((e) => e + b)(a),
  } as Record<VecKind | MatKind, <T extends vBase | mBase>(lhs: T, rhs: number) => T>,

  mulSxV: {
    vec2f: (s: number, v: wgsl.v2f) => unary2f((e) => s * e)(v),
    vec2h: (s: number, v: wgsl.v2h) => unary2h((e) => s * e)(v),
    vec2i: (s: number, v: wgsl.v2i) => unary2i((e) => s * e)(v),
    vec2u: (s: number, v: wgsl.v2u) => unary2u((e) => s * e)(v),

    vec3f: (s: number, v: wgsl.v3f) => unary3f((e) => s * e)(v),
    vec3h: (s: number, v: wgsl.v3h) => unary3h((e) => s * e)(v),
    vec3i: (s: number, v: wgsl.v3i) => unary3i((e) => s * e)(v),
    vec3u: (s: number, v: wgsl.v3u) => unary3u((e) => s * e)(v),

    vec4f: (s: number, v: wgsl.v4f) => unary4f((e) => s * e)(v),
    vec4h: (s: number, v: wgsl.v4h) => unary4h((e) => s * e)(v),
    vec4i: (s: number, v: wgsl.v4i) => unary4i((e) => s * e)(v),
    vec4u: (s: number, v: wgsl.v4u) => unary4u((e) => s * e)(v),

    mat2x2f: (s: number, m: wgsl.m2x2f) => unary2x2f((e) => s * e)(m),
    mat3x3f: (s: number, m: wgsl.m3x3f) => unary3x3f((e) => s * e)(m),
    mat4x4f: (s: number, m: wgsl.m4x4f) => unary4x4f((e) => s * e)(m),
  } as Record<VecKind | MatKind, <T extends vBase | wgsl.AnyMatInstance>(s: number, v: T) => T>,

  mulVxV: {
    vec2f: binaryComponentWise2f((a, b) => a * b),
    vec2h: binaryComponentWise2h((a, b) => a * b),
    vec2i: binaryComponentWise2i((a, b) => a * b),
    vec2u: binaryComponentWise2u((a, b) => a * b),

    vec3f: binaryComponentWise3f((a, b) => a * b),
    vec3h: binaryComponentWise3h((a, b) => a * b),
    vec3i: binaryComponentWise3i((a, b) => a * b),
    vec3u: binaryComponentWise3u((a, b) => a * b),

    vec4f: binaryComponentWise4f((a, b) => a * b),
    vec4h: binaryComponentWise4h((a, b) => a * b),
    vec4i: binaryComponentWise4i((a, b) => a * b),
    vec4u: binaryComponentWise4u((a, b) => a * b),

    mat2x2f: (a: wgsl.m2x2f, b: wgsl.m2x2f) => {
      const a_ = a.columns;
      const b_ = b.columns;

      return mat2x2f(
        a_[0].x * b_[0].x + a_[1].x * b_[0].y,
        a_[0].y * b_[0].x + a_[1].y * b_[0].y,
        a_[0].x * b_[1].x + a_[1].x * b_[1].y,
        a_[0].y * b_[1].x + a_[1].y * b_[1].y,
      );
    },

    mat3x3f: (a: wgsl.m3x3f, b: wgsl.m3x3f) => {
      const a_ = a.columns;
      const b_ = b.columns;

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
      const a_ = a.columns;
      const b_ = b.columns;

      return mat4x4f(
        a_[0].x * b_[0].x + a_[1].x * b_[0].y + a_[2].x * b_[0].z + a_[3].x * b_[0].w,
        a_[0].y * b_[0].x + a_[1].y * b_[0].y + a_[2].y * b_[0].z + a_[3].y * b_[0].w,
        a_[0].z * b_[0].x + a_[1].z * b_[0].y + a_[2].z * b_[0].z + a_[3].z * b_[0].w,
        a_[0].w * b_[0].x + a_[1].w * b_[0].y + a_[2].w * b_[0].z + a_[3].w * b_[0].w,
        a_[0].x * b_[1].x + a_[1].x * b_[1].y + a_[2].x * b_[1].z + a_[3].x * b_[1].w,
        a_[0].y * b_[1].x + a_[1].y * b_[1].y + a_[2].y * b_[1].z + a_[3].y * b_[1].w,
        a_[0].z * b_[1].x + a_[1].z * b_[1].y + a_[2].z * b_[1].z + a_[3].z * b_[1].w,
        a_[0].w * b_[1].x + a_[1].w * b_[1].y + a_[2].w * b_[1].z + a_[3].w * b_[1].w,
        a_[0].x * b_[2].x + a_[1].x * b_[2].y + a_[2].x * b_[2].z + a_[3].x * b_[2].w,
        a_[0].y * b_[2].x + a_[1].y * b_[2].y + a_[2].y * b_[2].z + a_[3].y * b_[2].w,
        a_[0].z * b_[2].x + a_[1].z * b_[2].y + a_[2].z * b_[2].z + a_[3].z * b_[2].w,
        a_[0].w * b_[2].x + a_[1].w * b_[2].y + a_[2].w * b_[2].z + a_[3].w * b_[2].w,
        a_[0].x * b_[3].x + a_[1].x * b_[3].y + a_[2].x * b_[3].z + a_[3].x * b_[3].w,
        a_[0].y * b_[3].x + a_[1].y * b_[3].y + a_[2].y * b_[3].z + a_[3].y * b_[3].w,
        a_[0].z * b_[3].x + a_[1].z * b_[3].y + a_[2].z * b_[3].z + a_[3].z * b_[3].w,
        a_[0].w * b_[3].x + a_[1].w * b_[3].y + a_[2].w * b_[3].z + a_[3].w * b_[3].w,
      );
    },
  } as Record<VecKind | MatKind, <T extends vBase | wgsl.AnyMatInstance>(lhs: T, rhs: T) => T>,

  mulMxV: {
    mat2x2f: (m: wgsl.m2x2f, v: wgsl.v2f) => {
      const m_ = m.columns;
      return vec2f(m_[0].x * v.x + m_[1].x * v.y, m_[0].y * v.x + m_[1].y * v.y);
    },

    mat3x3f: (m: wgsl.m3x3f, v: wgsl.v3f) => {
      const m_ = m.columns;
      return vec3f(
        m_[0].x * v.x + m_[1].x * v.y + m_[2].x * v.z,
        m_[0].y * v.x + m_[1].y * v.y + m_[2].y * v.z,
        m_[0].z * v.x + m_[1].z * v.y + m_[2].z * v.z,
      );
    },

    mat4x4f: (m: wgsl.m4x4f, v: wgsl.v4f) => {
      const m_ = m.columns;
      return vec4f(
        m_[0].x * v.x + m_[1].x * v.y + m_[2].x * v.z + m_[3].x * v.w,
        m_[0].y * v.x + m_[1].y * v.y + m_[2].y * v.z + m_[3].y * v.w,
        m_[0].z * v.x + m_[1].z * v.y + m_[2].z * v.z + m_[3].z * v.w,
        m_[0].w * v.x + m_[1].w * v.y + m_[2].w * v.z + m_[3].w * v.w,
      );
    },
  } as Record<
    MatKind,
    <T extends wgsl.AnyMatInstance>(m: T, v: wgsl.vBaseForMat<T>) => wgsl.vBaseForMat<T>
  >,

  mulVxM: {
    mat2x2f: (v: wgsl.v2f, m: wgsl.m2x2f) => {
      const m_ = m.columns;
      return vec2f(v.x * m_[0].x + v.y * m_[0].y, v.x * m_[1].x + v.y * m_[1].y);
    },

    mat3x3f: (v: wgsl.v3f, m: wgsl.m3x3f) => {
      const m_ = m.columns;
      return vec3f(
        v.x * m_[0].x + v.y * m_[0].y + v.z * m_[0].z,
        v.x * m_[1].x + v.y * m_[1].y + v.z * m_[1].z,
        v.x * m_[2].x + v.y * m_[2].y + v.z * m_[2].z,
      );
    },

    mat4x4f: (v: wgsl.v4f, m: wgsl.m4x4f) => {
      const m_ = m.columns;
      return vec4f(
        v.x * m_[0].x + v.y * m_[0].y + v.z * m_[0].z + v.w * m_[0].w,
        v.x * m_[1].x + v.y * m_[1].y + v.z * m_[1].z + v.w * m_[1].w,
        v.x * m_[2].x + v.y * m_[2].y + v.z * m_[2].z + v.w * m_[2].w,
        v.x * m_[3].x + v.y * m_[3].y + v.z * m_[3].z + v.w * m_[3].w,
      );
    },
  } as Record<
    MatKind,
    <T extends wgsl.AnyMatInstance>(v: wgsl.vBaseForMat<T>, m: T) => wgsl.vBaseForMat<T>
  >,

  div: {
    vec2f: binaryComponentWise2f((a, b) => a / b),
    vec2h: binaryComponentWise2h((a, b) => a / b),
    vec2i: binaryComponentWise2i(divInteger),
    vec2u: binaryComponentWise2u(divInteger),

    vec3f: binaryComponentWise3f((a, b) => a / b),
    vec3h: binaryComponentWise3h((a, b) => a / b),
    vec3i: binaryComponentWise3i(divInteger),
    vec3u: binaryComponentWise3u(divInteger),

    vec4f: binaryComponentWise4f((a, b) => a / b),
    vec4h: binaryComponentWise4h((a, b) => a / b),
    vec4i: binaryComponentWise4i(divInteger),
    vec4u: binaryComponentWise4u(divInteger),
  } as Record<VecKind, <T extends vBase>(a: T, b: T) => T>,

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
      return vec3f(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
    },
    vec3h: (a: wgsl.v3h, b: wgsl.v3h) => {
      return vec3h(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
    },
  } as Record<'vec3f' | 'vec3h', <T extends wgsl.v3f | wgsl.v3h>(a: T, b: T) => T>,

  mod: {
    vec2f: binaryComponentWise2f((a, b) => a % b),
    vec2h: binaryComponentWise2h((a, b) => a % b),
    vec2i: binaryComponentWise2i((a, b) => a % b),
    vec2u: binaryComponentWise2u((a, b) => a % b),

    vec3f: binaryComponentWise3f((a, b) => a % b),
    vec3h: binaryComponentWise3h((a, b) => a % b),
    vec3i: binaryComponentWise3i((a, b) => a % b),
    vec3u: binaryComponentWise3u((a, b) => a % b),

    vec4f: binaryComponentWise4f((a, b) => a % b),
    vec4h: binaryComponentWise4h((a, b) => a % b),
    vec4i: binaryComponentWise4i((a, b) => a % b),
    vec4u: binaryComponentWise4u((a, b) => a % b),
  } as Record<VecKind, <T extends vBase>(a: T, b: T) => T>,

  floor: {
    vec2f: unary2f(Math.floor),
    vec2h: unary2h(Math.floor),

    vec3f: unary3f(Math.floor),
    vec3h: unary3h(Math.floor),

    vec4f: unary4f(Math.floor),
    vec4h: unary4h(Math.floor),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  max: {
    vec2f: binaryComponentWise2f(Math.max),
    vec2h: binaryComponentWise2h(Math.max),
    vec2i: binaryComponentWise2i(Math.max),
    vec2u: binaryComponentWise2u(Math.max),

    vec3f: binaryComponentWise3f(Math.max),
    vec3h: binaryComponentWise3h(Math.max),
    vec3i: binaryComponentWise3i(Math.max),
    vec3u: binaryComponentWise3u(Math.max),

    vec4f: binaryComponentWise4f(Math.max),
    vec4h: binaryComponentWise4h(Math.max),
    vec4i: binaryComponentWise4i(Math.max),
    vec4u: binaryComponentWise4u(Math.max),
  } as Record<VecKind, <T extends vBase>(a: T, b: T) => T>,

  min: {
    vec2f: binaryComponentWise2f(Math.min),
    vec2h: binaryComponentWise2h(Math.min),
    vec2i: binaryComponentWise2i(Math.min),
    vec2u: binaryComponentWise2u(Math.min),

    vec3f: binaryComponentWise3f(Math.min),
    vec3h: binaryComponentWise3h(Math.min),
    vec3i: binaryComponentWise3i(Math.min),
    vec3u: binaryComponentWise3u(Math.min),

    vec4f: binaryComponentWise4f(Math.min),
    vec4h: binaryComponentWise4h(Math.min),
    vec4i: binaryComponentWise4i(Math.min),
    vec4u: binaryComponentWise4u(Math.min),
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
      vec4f(base.x ** exponent.x, base.y ** exponent.y, base.z ** exponent.z, base.w ** exponent.w),
    vec4h: (base: wgsl.v4h, exponent: wgsl.v4h) =>
      vec4h(base.x ** exponent.x, base.y ** exponent.y, base.z ** exponent.z, base.w ** exponent.w),
  } as Record<
    'vec2f' | 'vec3f' | 'vec4f' | 'vec2h' | 'vec3h' | 'vec4h' | 'number',
    <T extends wgsl.AnyFloatVecInstance | number>(a: T, b: T) => T
  >,

  sign: {
    vec2f: unary2f(Math.sign),
    vec2h: unary2h(Math.sign),
    vec2i: unary2i(Math.sign),

    vec3f: unary3f(Math.sign),
    vec3h: unary3h(Math.sign),
    vec3i: unary3i(Math.sign),

    vec4f: unary4f(Math.sign),
    vec4h: unary4h(Math.sign),
    vec4i: unary4i(Math.sign),
  } as Record<VecKind, <T extends vBase>(e: T) => T>,

  sqrt: {
    vec2f: unary2f(Math.sqrt),
    vec2h: unary2h(Math.sqrt),

    vec3f: unary3f(Math.sqrt),
    vec3h: unary3h(Math.sqrt),

    vec4f: unary4f(Math.sqrt),
    vec4h: unary4h(Math.sqrt),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  mix: {
    vec2f: (e1: wgsl.v2f, e2: wgsl.v2f, e3: wgsl.v2f | number) => {
      if (typeof e3 === 'number') {
        return vec2f(e1.x * (1 - e3) + e2.x * e3, e1.y * (1 - e3) + e2.y * e3);
      }
      return vec2f(e1.x * (1 - e3.x) + e2.x * e3.x, e1.y * (1 - e3.y) + e2.y * e3.y);
    },
    vec2h: (e1: wgsl.v2h, e2: wgsl.v2h, e3: wgsl.v2h | number) => {
      if (typeof e3 === 'number') {
        return vec2h(e1.x * (1 - e3) + e2.x * e3, e1.y * (1 - e3) + e2.y * e3);
      }
      return vec2h(e1.x * (1 - e3.x) + e2.x * e3.x, e1.y * (1 - e3.y) + e2.y * e3.y);
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

  sin: {
    vec2f: unary2f(Math.sin),
    vec2h: unary2h(Math.sin),

    vec3f: unary3f(Math.sin),
    vec3h: unary3h(Math.sin),

    vec4f: unary4f(Math.sin),
    vec4h: unary4h(Math.sin),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  cos: {
    vec2f: unary2f(Math.cos),
    vec2h: unary2h(Math.cos),

    vec3f: unary3f(Math.cos),
    vec3h: unary3h(Math.cos),

    vec4f: unary4f(Math.cos),
    vec4h: unary4h(Math.cos),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  cosh: {
    vec2f: unary2f(Math.cosh),
    vec2h: unary2h(Math.cosh),

    vec3f: unary3f(Math.cosh),
    vec3h: unary3h(Math.cosh),

    vec4f: unary4f(Math.cosh),
    vec4h: unary4h(Math.cosh),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  exp: {
    vec2f: unary2f(Math.exp),
    vec2h: unary2h(Math.exp),

    vec3f: unary3f(Math.exp),
    vec3h: unary3h(Math.exp),

    vec4f: unary4f(Math.exp),
    vec4h: unary4h(Math.exp),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  exp2: {
    vec2f: unary2f((val) => 2 ** val),
    vec2h: unary2h((val) => 2 ** val),

    vec3f: unary3f((val) => 2 ** val),
    vec3h: unary3h((val) => 2 ** val),

    vec4f: unary4f((val) => 2 ** val),
    vec4h: unary4h((val) => 2 ** val),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  log: {
    vec2f: unary2f(Math.log),
    vec2h: unary2h(Math.log),

    vec3f: unary3f(Math.log),
    vec3h: unary3h(Math.log),

    vec4f: unary4f(Math.log),
    vec4h: unary4h(Math.log),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  log2: {
    vec2f: unary2f(Math.log2),
    vec2h: unary2h(Math.log2),

    vec3f: unary3f(Math.log2),
    vec3h: unary3h(Math.log2),

    vec4f: unary4f(Math.log2),
    vec4h: unary4h(Math.log2),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  fract: {
    vec2f: unary2f((value) => value - Math.floor(value)),
    vec2h: unary2h((value) => value - Math.floor(value)),

    vec3f: unary3f((value) => value - Math.floor(value)),
    vec3h: unary3h((value) => value - Math.floor(value)),

    vec4f: unary4f((value) => value - Math.floor(value)),
    vec4h: unary4h((value) => value - Math.floor(value)),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  isCloseToZero: {
    vec2f: (v: wgsl.v2f, n: number) => Math.abs(v.x) <= n && Math.abs(v.y) <= n,
    vec2h: (v: wgsl.v2h, n: number) => Math.abs(v.x) <= n && Math.abs(v.y) <= n,

    vec3f: (v: wgsl.v3f, n: number) =>
      Math.abs(v.x) <= n && Math.abs(v.y) <= n && Math.abs(v.z) <= n,
    vec3h: (v: wgsl.v3h, n: number) =>
      Math.abs(v.x) <= n && Math.abs(v.y) <= n && Math.abs(v.z) <= n,

    vec4f: (v: wgsl.v4f, n: number) =>
      Math.abs(v.x) <= n && Math.abs(v.y) <= n && Math.abs(v.z) <= n && Math.abs(v.w) <= n,
    vec4h: (v: wgsl.v4h, n: number) =>
      Math.abs(v.x) <= n && Math.abs(v.y) <= n && Math.abs(v.z) <= n && Math.abs(v.w) <= n,
  } as Record<VecKind, <T extends vBase>(v: T, n: number) => boolean>,

  neg: {
    vec2f: unary2f((value) => -value),
    vec2h: unary2h((value) => -value),
    vec2i: unary2i((value) => -value),
    vec2u: unary2u((value) => -value),
    'vec2<bool>': (e: wgsl.v2b) => vec2b(!e.x, !e.y),

    vec3f: unary3f((value) => -value),
    vec3h: unary3h((value) => -value),
    vec3i: unary3i((value) => -value),
    vec3u: unary3u((value) => -value),
    'vec3<bool>': (e: wgsl.v3b) => vec3b(!e.x, !e.y, !e.z),

    vec4f: unary4f((value) => -value),
    vec4h: unary4h((value) => -value),
    vec4i: unary4i((value) => -value),
    vec4u: unary4u((value) => -value),
    'vec4<bool>': (e: wgsl.v4b) => vec4b(!e.x, !e.y, !e.z, !e.w),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  select: {
    vec2f: (f: wgsl.v2f, t: wgsl.v2f, c: wgsl.v2b) => vec2f(c.x ? t.x : f.x, c.y ? t.y : f.y),
    vec2h: (f: wgsl.v2h, t: wgsl.v2h, c: wgsl.v2b) => vec2h(c.x ? t.x : f.x, c.y ? t.y : f.y),
    vec2i: (f: wgsl.v2i, t: wgsl.v2i, c: wgsl.v2b) => vec2i(c.x ? t.x : f.x, c.y ? t.y : f.y),
    vec2u: (f: wgsl.v2u, t: wgsl.v2u, c: wgsl.v2b) => vec2u(c.x ? t.x : f.x, c.y ? t.y : f.y),
    'vec2<bool>': (f: wgsl.v2b, t: wgsl.v2b, c: wgsl.v2b) =>
      vec2b(c.x ? t.x : f.x, c.y ? t.y : f.y),

    vec3f: (f: wgsl.v3f, t: wgsl.v3f, c: wgsl.v3b) =>
      vec3f(c.x ? t.x : f.x, c.y ? t.y : f.y, c.z ? t.z : f.z),
    vec3h: (f: wgsl.v3h, t: wgsl.v3h, c: wgsl.v3b) =>
      vec3h(c.x ? t.x : f.x, c.y ? t.y : f.y, c.z ? t.z : f.z),
    vec3i: (f: wgsl.v3i, t: wgsl.v3i, c: wgsl.v3b) =>
      vec3i(c.x ? t.x : f.x, c.y ? t.y : f.y, c.z ? t.z : f.z),
    vec3u: (f: wgsl.v3u, t: wgsl.v3u, c: wgsl.v3b) =>
      vec3u(c.x ? t.x : f.x, c.y ? t.y : f.y, c.z ? t.z : f.z),
    'vec3<bool>': (f: wgsl.v3b, t: wgsl.v3b, c: wgsl.v3b) =>
      vec3b(c.x ? t.x : f.x, c.y ? t.y : f.y, c.z ? t.z : f.z),

    vec4f: (f: wgsl.v4f, t: wgsl.v4f, c: wgsl.v4b) =>
      vec4f(c.x ? t.x : f.x, c.y ? t.y : f.y, c.z ? t.z : f.z, c.w ? t.w : f.w),
    vec4h: (f: wgsl.v4h, t: wgsl.v4h, c: wgsl.v4b) =>
      vec4h(c.x ? t.x : f.x, c.y ? t.y : f.y, c.z ? t.z : f.z, c.w ? t.w : f.w),
    vec4i: (f: wgsl.v4i, t: wgsl.v4i, c: wgsl.v4b) =>
      vec4i(c.x ? t.x : f.x, c.y ? t.y : f.y, c.z ? t.z : f.z, c.w ? t.w : f.w),
    vec4u: (f: wgsl.v4u, t: wgsl.v4u, c: wgsl.v4b) =>
      vec4u(c.x ? t.x : f.x, c.y ? t.y : f.y, c.z ? t.z : f.z, c.w ? t.w : f.w),
    'vec4<bool>': (f: wgsl.v4b, t: wgsl.v4b, c: wgsl.v4b) =>
      vec4b(c.x ? t.x : f.x, c.y ? t.y : f.y, c.z ? t.z : f.z, c.w ? t.w : f.w),
  } as Record<
    VecKind,
    <T extends wgsl.AnyVecInstance>(
      f: T,
      t: T,
      c: T extends wgsl.AnyVec2Instance
        ? wgsl.v2b
        : T extends wgsl.AnyVec3Instance
          ? wgsl.v3b
          : wgsl.v4b,
    ) => T
  >,

  tanh: {
    vec2f: unary2f(Math.tanh),
    vec2h: unary2h(Math.tanh),

    vec3f: unary3f(Math.tanh),
    vec3h: unary3h(Math.tanh),

    vec4f: unary4f(Math.tanh),
    vec4h: unary4h(Math.tanh),
  } as Record<VecKind, <T extends vBase>(v: T) => T>,

  bitcastU32toF32: {
    vec2u: (n: wgsl.v2u) => vec2f(bitcastU32toF32Impl(n.x), bitcastU32toF32Impl(n.y)),
    vec3u: (n: wgsl.v3u) =>
      vec3f(bitcastU32toF32Impl(n.x), bitcastU32toF32Impl(n.y), bitcastU32toF32Impl(n.z)),
    vec4u: (n: wgsl.v4u) =>
      vec4f(
        bitcastU32toF32Impl(n.x),
        bitcastU32toF32Impl(n.y),
        bitcastU32toF32Impl(n.z),
        bitcastU32toF32Impl(n.w),
      ),
  } as Record<
    VecKind,
    <T extends wgsl.AnyUnsignedVecInstance>(
      v: T,
    ) => T extends wgsl.v2u ? wgsl.v2f : T extends wgsl.v3u ? wgsl.v3f : wgsl.v4f
  >,

  bitcastU32toI32: {
    vec2u: (n: wgsl.v2u) => vec2i(bitcastU32toI32Impl(n.x), bitcastU32toI32Impl(n.y)),
    vec3u: (n: wgsl.v3u) =>
      vec3i(bitcastU32toI32Impl(n.x), bitcastU32toI32Impl(n.y), bitcastU32toI32Impl(n.z)),
    vec4u: (n: wgsl.v4u) =>
      vec4i(
        bitcastU32toI32Impl(n.x),
        bitcastU32toI32Impl(n.y),
        bitcastU32toI32Impl(n.z),
        bitcastU32toI32Impl(n.w),
      ),
  } as Record<
    VecKind,
    <T extends wgsl.AnyUnsignedVecInstance>(
      v: T,
    ) => T extends wgsl.v2u ? wgsl.v2i : T extends wgsl.v3u ? wgsl.v3i : wgsl.v4i
  >,
};
