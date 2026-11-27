import { mat2x2f, mat2x2h, mat3x3f, mat3x3h, mat4x4f, mat4x4h } from './matrix.ts';
import { bitcastF32toU32Impl, bitcastU32toF32Impl, bitcastU32toI32Impl } from './numberOps.ts';
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
} from './vector.ts';
import type * as wgsl from './wgslTypes.ts';
import type { MatKind, VecKind } from './wgslTypes.ts';

type vBase = { kind: VecKind };
type v2 = wgsl.v2f | wgsl.v2h | wgsl.v2i | wgsl.v2u;
type v3 = wgsl.v3f | wgsl.v3h | wgsl.v3i | wgsl.v3u;
type v4 = wgsl.v4f | wgsl.v4h | wgsl.v4i | wgsl.v4u;

const lengthVec2 = (v: v2) => Math.sqrt(v.x ** 2 + v.y ** 2);
const lengthVec3 = (v: v3) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
const lengthVec4 = (v: v4) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2 + v.w ** 2);

const dotVec2 = (lhs: v2, rhs: v2) => lhs.x * rhs.x + lhs.y * rhs.y;
const dotVec3 = (lhs: v3, rhs: v3) => lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z;
const dotVec4 = (lhs: v4, rhs: v4) => lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w;

const mulMxM2 =
  <M extends wgsl.AnyMat2x2Instance>(ctor: (...elements: number[]) => M) =>
  (a: M, b: M): M => {
    const a_ = a.columns;
    const b_ = b.columns;

    return ctor(
      a_[0].x * b_[0].x + a_[1].x * b_[0].y,
      a_[0].y * b_[0].x + a_[1].y * b_[0].y,
      a_[0].x * b_[1].x + a_[1].x * b_[1].y,
      a_[0].y * b_[1].x + a_[1].y * b_[1].y,
    );
  };

const mulMxM3 =
  <M extends wgsl.AnyMat3x3Instance>(ctor: (...elements: number[]) => M) =>
  (a: M, b: M): M => {
    const a_ = a.columns;
    const b_ = b.columns;

    return ctor(
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
  };

const mulMxM4 =
  <M extends wgsl.AnyMat4x4Instance>(ctor: (...elements: number[]) => M) =>
  (a: M, b: M): M => {
    const a_ = a.columns;
    const b_ = b.columns;

    return ctor(
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
  };

const mulMxV2 =
  <V extends v2>(ctor: (...components: number[]) => V) =>
  (m: wgsl.AnyMat2x2Instance, v: v2): V => {
    const m_ = m.columns;
    return ctor(m_[0].x * v.x + m_[1].x * v.y, m_[0].y * v.x + m_[1].y * v.y);
  };

const mulMxV3 =
  <V extends v3>(ctor: (...components: number[]) => V) =>
  (m: wgsl.AnyMat3x3Instance, v: v3): V => {
    const m_ = m.columns;
    return ctor(
      m_[0].x * v.x + m_[1].x * v.y + m_[2].x * v.z,
      m_[0].y * v.x + m_[1].y * v.y + m_[2].y * v.z,
      m_[0].z * v.x + m_[1].z * v.y + m_[2].z * v.z,
    );
  };

const mulMxV4 =
  <V extends v4>(ctor: (...components: number[]) => V) =>
  (m: wgsl.AnyMat4x4Instance, v: v4): V => {
    const m_ = m.columns;
    return ctor(
      m_[0].x * v.x + m_[1].x * v.y + m_[2].x * v.z + m_[3].x * v.w,
      m_[0].y * v.x + m_[1].y * v.y + m_[2].y * v.z + m_[3].y * v.w,
      m_[0].z * v.x + m_[1].z * v.y + m_[2].z * v.z + m_[3].z * v.w,
      m_[0].w * v.x + m_[1].w * v.y + m_[2].w * v.z + m_[3].w * v.w,
    );
  };

const mulVxM2 =
  <V extends v2>(ctor: (...components: number[]) => V) =>
  (v: v2, m: wgsl.AnyMat2x2Instance): V => {
    const m_ = m.columns;
    return ctor(v.x * m_[0].x + v.y * m_[0].y, v.x * m_[1].x + v.y * m_[1].y);
  };

const mulVxM3 =
  <V extends v3>(ctor: (...components: number[]) => V) =>
  (v: v3, m: wgsl.AnyMat3x3Instance): V => {
    const m_ = m.columns;
    return ctor(
      v.x * m_[0].x + v.y * m_[0].y + v.z * m_[0].z,
      v.x * m_[1].x + v.y * m_[1].y + v.z * m_[1].z,
      v.x * m_[2].x + v.y * m_[2].y + v.z * m_[2].z,
    );
  };

const mulVxM4 =
  <V extends v4>(ctor: (...components: number[]) => V) =>
  (v: v4, m: wgsl.AnyMat4x4Instance): V => {
    const m_ = m.columns;
    return ctor(
      v.x * m_[0].x + v.y * m_[0].y + v.z * m_[0].z + v.w * m_[0].w,
      v.x * m_[1].x + v.y * m_[1].y + v.z * m_[1].z + v.w * m_[1].w,
      v.x * m_[2].x + v.y * m_[2].y + v.z * m_[2].z + v.w * m_[2].w,
      v.x * m_[3].x + v.y * m_[3].y + v.z * m_[3].z + v.w * m_[3].w,
    );
  };

type BinaryOp = (a: number, b: number) => number;

const binaryComponentWise2u = (op: BinaryOp) => (a: wgsl.v2u, b: wgsl.v2u) =>
  vec2u(op(a.x, b.x), op(a.y, b.y));

const binaryComponentWise3u = (op: BinaryOp) => (a: wgsl.v3u, b: wgsl.v3u) =>
  vec3u(op(a.x, b.x), op(a.y, b.y), op(a.z, b.z));

const binaryComponentWise4u = (op: BinaryOp) => (a: wgsl.v4u, b: wgsl.v4u) =>
  vec4u(op(a.x, b.x), op(a.y, b.y), op(a.z, b.z), op(a.w, b.w));

const binaryComponentWise2i2u = (op: BinaryOp) => (a: wgsl.v2i, b: wgsl.v2u) =>
  vec2i(op(a.x, b.x), op(a.y, b.y));

const binaryComponentWise3i3u = (op: BinaryOp) => (a: wgsl.v3i, b: wgsl.v3u) =>
  vec3i(op(a.x, b.x), op(a.y, b.y), op(a.z, b.z));

const binaryComponentWise4i4u = (op: BinaryOp) => (a: wgsl.v4i, b: wgsl.v4u) =>
  vec4i(op(a.x, b.x), op(a.y, b.y), op(a.z, b.z), op(a.w, b.w));

/**
 * Functions that cannot be simply generalized via `generalizeFn`
 * have their overloads listed explicitly here.
 */
export const VectorOps = {
  all: {
    'vec2<bool>': (e: wgsl.v2b) => e.x && e.y,
    'vec3<bool>': (e: wgsl.v3b) => e.x && e.y && e.z,
    'vec4<bool>': (e: wgsl.v4b) => e.x && e.y && e.z && e.w,
  } as Record<VecKind, (v: wgsl.AnyBooleanVecInstance) => boolean>,

  length: {
    vec2f: lengthVec2,
    vec2h: lengthVec2,

    vec3f: lengthVec3,
    vec3h: lengthVec3,

    vec4f: lengthVec4,
    vec4h: lengthVec4,
  } as Record<VecKind, (v: vBase) => number>,

  mulMxM: {
    mat2x2f: mulMxM2(mat2x2f),
    mat3x3f: mulMxM3(mat3x3f),
    mat4x4f: mulMxM4(mat4x4f),
    mat2x2h: mulMxM2(mat2x2h),
    mat3x3h: mulMxM3(mat3x3h),
    mat4x4h: mulMxM4(mat4x4h),
  } as Record<VecKind | MatKind, <T extends vBase | wgsl.AnyMatInstance>(lhs: T, rhs: T) => T>,

  mulMxV: {
    mat2x2f: mulMxV2(vec2f),
    mat3x3f: mulMxV3(vec3f),
    mat4x4f: mulMxV4(vec4f),
    mat2x2h: mulMxV2(vec2h),
    mat3x3h: mulMxV3(vec3h),
    mat4x4h: mulMxV4(vec4h),
  } as Record<
    MatKind,
    <T extends wgsl.AnyMatInstance>(m: T, v: wgsl.vBaseForMat<T>) => wgsl.vBaseForMat<T>
  >,

  mulVxM: {
    mat2x2f: mulVxM2(vec2f),
    mat3x3f: mulVxM3(vec3f),
    mat4x4f: mulVxM4(vec4f),
    mat2x2h: mulVxM2(vec2h),
    mat3x3h: mulVxM3(vec3h),
    mat4x4h: mulVxM4(vec4h),
  } as Record<
    MatKind,
    <T extends wgsl.AnyMatInstance>(v: wgsl.vBaseForMat<T>, m: T) => wgsl.vBaseForMat<T>
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

  cross: {
    vec3f: (a: wgsl.v3f, b: wgsl.v3f) => {
      return vec3f(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
    },
    vec3h: (a: wgsl.v3h, b: wgsl.v3h) => {
      return vec3h(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
    },
  } as Record<'vec3f' | 'vec3h', <T extends wgsl.v3f | wgsl.v3h>(a: T, b: T) => T>,

  bitShiftLeft: {
    vec2i: binaryComponentWise2i2u((a, b) => a << b),
    vec2u: binaryComponentWise2u((a, b) => a << b),

    vec3i: binaryComponentWise3i3u((a, b) => a << b),
    vec3u: binaryComponentWise3u((a, b) => a << b),

    vec4i: binaryComponentWise4i4u((a, b) => a << b),
    vec4u: binaryComponentWise4u((a, b) => a << b),
  } as Record<
    VecKind,
    <T extends wgsl.AnyIntegerVecInstance, U extends wgsl.AnyUnsignedVecInstance>(a: T, b: U) => T
  >,

  bitShiftRight: {
    vec2i: binaryComponentWise2i2u((a, b) => a >> b),
    vec2u: binaryComponentWise2u((a, b) => a >>> b),

    vec3i: binaryComponentWise3i3u((a, b) => a >> b),
    vec3u: binaryComponentWise3u((a, b) => a >>> b),

    vec4i: binaryComponentWise4i4u((a, b) => a >> b),
    vec4u: binaryComponentWise4u((a, b) => a >>> b),
  } as Record<
    VecKind,
    <T extends wgsl.AnyIntegerVecInstance, U extends wgsl.AnyUnsignedVecInstance>(a: T, b: U) => T
  >,

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

  bitcastF32toU32: {
    vec2f: (n: wgsl.v2f) => vec2u(bitcastF32toU32Impl(n.x), bitcastF32toU32Impl(n.y)),
    vec3f: (n: wgsl.v3f) =>
      vec3u(bitcastF32toU32Impl(n.x), bitcastF32toU32Impl(n.y), bitcastF32toU32Impl(n.z)),
    vec4f: (n: wgsl.v4f) =>
      vec4u(
        bitcastF32toU32Impl(n.x),
        bitcastF32toU32Impl(n.y),
        bitcastF32toU32Impl(n.z),
        bitcastF32toU32Impl(n.w),
      ),
  } as Record<
    VecKind,
    <T extends wgsl.AnyFloatVecInstance>(
      v: T,
    ) => T extends wgsl.v2f ? wgsl.v2u : T extends wgsl.v3f ? wgsl.v3u : wgsl.v4u
  >,
};
