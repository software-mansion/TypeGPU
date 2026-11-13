import { dualImpl, MissingCpuImplError } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { mat2x2f, mat3x3f, mat4x4f } from '../data/matrix.ts';
import { clampScalar, smoothstepScalar } from '../data/numberOps.ts';
import { abstractFloat, abstractInt, f16, f32, i32, u32 } from '../data/numeric.ts';
import { type Snippet, snip, withValue } from '../data/snippet.ts';
import { abstruct } from '../data/struct.ts';
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
} from '../data/vector.ts';
import { VectorOps } from '../data/vectorOps.ts';
import {
  floatKind,
  matrixKind,
  numericKind,
  signedKind,
  crossKind,
  assertEqualKinds,
  assertKind,
  upCast,
  generalizeFn,
} from '../data/generalizeFn.ts';
import {
  type AnyFloat32VecInstance,
  type AnyFloatVecInstance,
  type AnyIntegerVecInstance,
  type AnyMatInstance,
  type AnyNumericVecInstance,
  type AnySignedVecInstance,
  type BaseData,
  isHalfPrecisionSchema,
  isVecInstance,
  type v2f,
  type v2h,
  type v2i,
  type v3f,
  type v3h,
  type v3i,
  type v4f,
  type v4h,
  type v4i,
  type Vec2f,
  type VecData,
  WORKAROUND_getSchema,
} from '../data/wgslTypes.ts';
import { SignatureNotSupportedError } from '../errors.ts';
import type { Infer } from '../shared/repr.ts';
import { assertExhaustive } from '../shared/utilityTypes.ts';
import { unify } from '../tgsl/conversion.ts';
import { asComptime, type ResolutionCtx } from '../types.ts';
import { mul, sub } from './operators.ts';

type NumVec = AnyNumericVecInstance;

// helpers

const unaryIdentitySignature = (arg: BaseData) => {
  return {
    argTypes: [arg],
    returnType: arg,
  };
};

const variadicUnifySignature = (...args: BaseData[]) => {
  const uargs = unify(args) ?? args;
  return {
    argTypes: uargs,
    returnType: uargs[0] as BaseData,
  };
};

/*#__NO_SIDE_EFFECTS__*/
export function unifyRestrictedSignature(restrict: BaseData[]) {
  return (...args: BaseData[]) => {
    const uargs = unify(args, restrict);
    if (!uargs) {
      throw new SignatureNotSupportedError(args, restrict);
    }
    return {
      argTypes: uargs,
      returnType: uargs[0] as BaseData,
    };
  };
}

function variadicReduce<T>(fn: (a: T, b: T) => T) {
  return (fst: T, ...rest: T[]): T => {
    let acc = fst;
    for (const r of rest) {
      acc = fn(acc, r);
    }
    return acc;
  };
}

function variadicStitch(wrapper: string) {
  return (
    _ctx: ResolutionCtx,
    [fst, ...rest]: readonly [fst: Snippet, ...rest: Snippet[]],
  ): string => {
    let acc = stitch`${fst}`;
    for (const r of rest) {
      acc = stitch`${wrapper}(${acc}, ${r})`;
    }
    return acc;
  };
}

const anyFloatPrimitive = [f32, f16, abstractFloat];
const anyFloatVec = [vec2f, vec3f, vec4f, vec2h, vec3h, vec4h];
const anyFloat = [...anyFloatPrimitive, ...anyFloatVec];
const anyConcreteIntegerPrimitive = [i32, u32];
const anyConcreteIntegerVec = [vec2i, vec3i, vec4i, vec2u, vec3u, vec4u];
const anyConcreteInteger = [...anyConcreteIntegerPrimitive, ...anyConcreteIntegerVec];

// std

function cpuAbs(value: number): number;
function cpuAbs<T extends NumVec | number>(value: T): T;
function cpuAbs<T extends NumVec | number>(value: T): T {
  assertKind(value, numericKind);
  return generalizeFn(Math.abs, [value]);
}

export const abs = /*#__PURE__*/ dualImpl({
  name: 'abs',
  signature: unaryIdentitySignature,
  normalImpl: cpuAbs,
  codegenImpl: (_ctx, [value]) => stitch`abs(${value})`,
  sideEffects: false,
});

function cpuAcos(value: number): number;
function cpuAcos<T extends AnyFloatVecInstance>(value: T): T;
function cpuAcos<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.acos, [value]);
}

export const acos = /*#__PURE__*/ dualImpl({
  name: 'acos',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuAcos,
  codegenImpl: (_ctx, [value]) => stitch`acos(${value})`,
  sideEffects: false,
});

function cpuAcosh(value: number): number;
function cpuAcosh<T extends AnyFloatVecInstance>(value: T): T;
function cpuAcosh<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.acosh, [value]);
}

export const acosh = /*#__PURE__*/ dualImpl({
  name: 'acosh',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuAcosh,
  codegenImpl: (_ctx, [value]) => stitch`acosh(${value})`,
  sideEffects: false,
});

function cpuAsin(value: number): number;
function cpuAsin<T extends AnyFloatVecInstance>(value: T): T;
function cpuAsin<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.asin, [value]);
}

export const asin = /*#__PURE__*/ dualImpl({
  name: 'asin',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuAsin,
  codegenImpl: (_ctx, [value]) => stitch`asin(${value})`,
  sideEffects: false,
});

function cpuAsinh(value: number): number;
function cpuAsinh<T extends AnyFloatVecInstance>(value: T): T;
function cpuAsinh<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.asinh, [value]);
}

export const asinh = /*#__PURE__*/ dualImpl({
  name: 'asinh',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuAsinh,
  codegenImpl: (_ctx, [value]) => stitch`asinh(${value})`,
  sideEffects: false,
});

function cpuAtan(value: number): number;
function cpuAtan<T extends AnyFloatVecInstance>(value: T): T;
function cpuAtan<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.atan, [value]);
}

export const atan = /*#__PURE__*/ dualImpl({
  name: 'atan',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuAtan,
  codegenImpl: (_ctx, [value]) => stitch`atan(${value})`,
  sideEffects: false,
});

function cpuAtanh(value: number): number;
function cpuAtanh<T extends AnyFloatVecInstance>(value: T): T;
function cpuAtanh<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.atanh, [value]);
}

export const atanh = /*#__PURE__*/ dualImpl({
  name: 'atanh',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuAtanh,
  codegenImpl: (_ctx, [value]) => stitch`atanh(${value})`,
  sideEffects: false,
});

function cpuAtan2(y: number, x: number): number;
function cpuAtan2<T extends AnyFloatVecInstance>(y: T, x: T): T;
function cpuAtan2<T extends AnyFloatVecInstance | number>(y: T, x: T): T {
  assertKind([y, x], floatKind);
  assertEqualKinds(y, x);
  return generalizeFn(Math.atan2, [y, x]);
}

export const atan2 = /*#__PURE__*/ dualImpl({
  name: 'atan2',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuAtan2,
  codegenImpl: (_ctx, [y, x]) => stitch`atan2(${y}, ${x})`,
  sideEffects: false,
});

function cpuCeil(value: number): number;
function cpuCeil<T extends AnyFloatVecInstance>(value: T): T;
function cpuCeil<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.ceil, [value]);
}

export const ceil = /*#__PURE__*/ dualImpl({
  name: 'ceil',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuCeil,
  codegenImpl: (_ctx, [value]) => stitch`ceil(${value})`,
  sideEffects: false,
});

function cpuClamp(value: number, low: number, high: number): number;
function cpuClamp<T extends NumVec | number>(value: T, low: T, high: T): T;
function cpuClamp<T extends NumVec | number>(value: T, low: T, high: T): T {
  assertKind([value, low, high], numericKind);
  assertEqualKinds(value, low, high);
  return generalizeFn(clampScalar, [value, low, high]);
}

export const clamp = /*#__PURE__*/ dualImpl({
  name: 'clamp',
  signature: variadicUnifySignature,
  normalImpl: cpuClamp,
  codegenImpl: (_ctx, [value, low, high]) => stitch`clamp(${value}, ${low}, ${high})`,
  sideEffects: false,
});

function cpuCos(value: number): number;
function cpuCos<T extends AnyFloatVecInstance>(value: T): T;
function cpuCos<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.cos, [value]);
}

export const cos = /*#__PURE__*/ dualImpl({
  name: 'cos',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuCos,
  codegenImpl: (_ctx, [value]) => stitch`cos(${value})`,
  sideEffects: false,
});

function cpuCosh(value: number): number;
function cpuCosh<T extends AnyFloatVecInstance>(value: T): T;
function cpuCosh<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.cosh, [value]);
}

export const cosh = /*#__PURE__*/ dualImpl({
  name: 'cosh',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuCosh,
  codegenImpl: (_ctx, [value]) => stitch`cosh(${value})`,
  sideEffects: false,
});

function cpuCountLeadingZeros(value: number): number;
function cpuCountLeadingZeros<T extends AnyIntegerVecInstance>(value: T): T;
function cpuCountLeadingZeros<T extends AnyIntegerVecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const countLeadingZeros = /*#__PURE__*/ dualImpl<typeof cpuCountLeadingZeros>({
  name: 'countLeadingZeros',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyConcreteInteger),
  normalImpl:
    'CPU implementation for countLeadingZeros not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`countLeadingZeros(${value})`,
  sideEffects: false,
});

function cpuCountOneBits(value: number): number;
function cpuCountOneBits<T extends AnyIntegerVecInstance>(value: T): T;
function cpuCountOneBits<T extends AnyIntegerVecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const countOneBits = /*#__PURE__*/ dualImpl<typeof cpuCountOneBits>({
  name: 'countOneBits',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyConcreteInteger),
  normalImpl:
    'CPU implementation for countOneBits not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`countOneBits(${value})`,
  sideEffects: false,
});

function cpuCountTrailingZeros(value: number): number;
function cpuCountTrailingZeros<T extends AnyIntegerVecInstance>(value: T): T;
function cpuCountTrailingZeros<T extends AnyIntegerVecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const countTrailingZeros = /*#__PURE__*/ dualImpl<typeof cpuCountTrailingZeros>({
  name: 'countTrailingZeros',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyConcreteInteger),
  normalImpl:
    'CPU implementation for countTrailingZeros not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`countTrailingZeros(${value})`,
  sideEffects: false,
});

export const cross = /*#__PURE__*/ dualImpl({
  name: 'cross',
  signature: /*#__PURE__*/ unifyRestrictedSignature([vec3f, vec3h]),
  normalImpl: <T extends v3f | v3h>(a: T, b: T): T => {
    assertKind([a, b], crossKind);
    assertEqualKinds(a, b);
    return VectorOps.cross[a.kind](a, b);
  },
  codegenImpl: (_ctx, [a, b]) => stitch`cross(${a}, ${b})`,
  sideEffects: false,
});

function cpuDegrees(value: number): number;
function cpuDegrees<T extends AnyFloatVecInstance>(value: T): T;
function cpuDegrees<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  if (typeof value === 'number') {
    return ((value * 180) / Math.PI) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for degrees on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const degrees = /*#__PURE__*/ dualImpl<typeof cpuDegrees>({
  name: 'degrees',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuDegrees,
  codegenImpl: (_ctx, [value]) => stitch`degrees(${value})`,
  sideEffects: false,
});

export const determinant = /*#__PURE__*/ dualImpl<(value: AnyMatInstance) => number>({
  name: 'determinant',
  signature: (arg) => {
    if (!(arg.type === 'mat2x2f' || arg.type === 'mat3x3f' || arg.type === 'mat4x4f')) {
      throw new SignatureNotSupportedError([arg], [mat2x2f, mat3x3f, mat4x4f]);
    }
    return { argTypes: [arg], returnType: f32 };
  },
  normalImpl:
    'CPU implementation for determinant not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`determinant(${value})`,
  sideEffects: false,
});

function cpuDistance(a: number, b: number): number;
function cpuDistance<T extends AnyFloatVecInstance>(a: T, b: T): number;
function cpuDistance<T extends AnyFloatVecInstance | number>(a: T, b: T): number {
  assertKind([a, b], floatKind);
  assertEqualKinds(a, b);
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b);
  }
  return length(sub(a as AnyFloatVecInstance, b as AnyFloatVecInstance));
}

export const distance = /*#__PURE__*/ dualImpl({
  name: 'distance',
  signature: (...args) => {
    const uargs = unify(args, anyFloat);
    if (!uargs) {
      throw new SignatureNotSupportedError(args, anyFloat);
    }
    return {
      argTypes: uargs,
      returnType: isHalfPrecisionSchema(uargs[0]) ? f16 : f32,
    };
  },
  normalImpl: cpuDistance,
  codegenImpl: (_ctx, [a, b]) => stitch`distance(${a}, ${b})`,
  sideEffects: false,
});

export const dot = /*#__PURE__*/ dualImpl({
  name: 'dot',
  signature: (...args) => ({
    argTypes: args,
    returnType: (args[0] as VecData).primitive,
  }),
  normalImpl: <T extends NumVec>(lhs: T, rhs: T): number => {
    assertKind([lhs, rhs], numericKind, true);
    assertEqualKinds(lhs, rhs);
    return VectorOps.dot[lhs.kind](lhs, rhs);
  },
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`dot(${lhs}, ${rhs})`,
  sideEffects: false,
});

export const dot4U8Packed = /*#__PURE__*/ dualImpl<(e1: number, e2: number) => number>({
  name: 'dot4U8Packed',
  signature: { argTypes: [u32, u32], returnType: u32 },
  normalImpl:
    'CPU implementation for dot4U8Packed not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [e1, e2]) => stitch`dot4U8Packed(${e1}, ${e2})`,
  sideEffects: false,
});

export const dot4I8Packed = /*#__PURE__*/ dualImpl<(e1: number, e2: number) => number>({
  name: 'dot4I8Packed',
  signature: { argTypes: [u32, u32], returnType: i32 },
  normalImpl:
    'CPU implementation for dot4I8Packed not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [e1, e2]) => stitch`dot4I8Packed(${e1}, ${e2})`,
  sideEffects: false,
});

function cpuExp(value: number): number;
function cpuExp<T extends AnyFloatVecInstance>(value: T): T;
function cpuExp<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.exp, [value]);
}

export const exp = /*#__PURE__*/ dualImpl({
  name: 'exp',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuExp,
  codegenImpl: (_ctx, [value]) => stitch`exp(${value})`,
  sideEffects: false,
});

function cpuExp2(value: number): number;
function cpuExp2<T extends AnyFloatVecInstance>(value: T): T;
function cpuExp2<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn((val) => 2 ** val, [value]);
}

export const exp2 = /*#__PURE__*/ dualImpl({
  name: 'exp2',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuExp2,
  codegenImpl: (_ctx, [value]) => stitch`exp2(${value})`,
  sideEffects: false,
});

function cpuExtractBits(e: number, offset: number, count: number): number;
function cpuExtractBits<T extends AnyIntegerVecInstance>(e: T, offset: number, count: number): T;
function cpuExtractBits<T extends AnyIntegerVecInstance | number>(
  _e: T,
  _offset: number,
  _count: number,
): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const extractBits = /*#__PURE__*/ dualImpl<typeof cpuExtractBits>({
  name: 'extractBits',
  signature: (arg, _offset, _count) => {
    const argRestricted = unify([arg], anyConcreteInteger)?.[0];
    if (!argRestricted) {
      throw new SignatureNotSupportedError([arg], anyConcreteInteger);
    }
    return {
      argTypes: [argRestricted, u32, u32],
      returnType: argRestricted,
    };
  },
  normalImpl:
    'CPU implementation for extractBits not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [e, offset, count]) => stitch`extractBits(${e}, ${offset}, ${count})`,
  sideEffects: false,
});

export const faceForward = /*#__PURE__*/ dualImpl<
  <T extends AnyFloatVecInstance>(e1: T, e2: T, e3: T) => T
>({
  name: 'faceForward',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloatVec),
  normalImpl:
    'CPU implementation for faceForward not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [e1, e2, e3]) => stitch`faceForward(${e1}, ${e2}, ${e3})`,
  sideEffects: false,
});

function cpuFirstLeadingBit(value: number): number;
function cpuFirstLeadingBit<T extends AnyIntegerVecInstance>(value: T): T;
function cpuFirstLeadingBit<T extends AnyIntegerVecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const firstLeadingBit = /*#__PURE__*/ dualImpl<typeof cpuFirstLeadingBit>({
  name: 'firstLeadingBit',
  signature: unaryIdentitySignature,
  normalImpl:
    'CPU implementation for firstLeadingBit not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`firstLeadingBit(${value})`,
  sideEffects: false,
});

function cpuFirstTrailingBit(value: number): number;
function cpuFirstTrailingBit<T extends AnyIntegerVecInstance>(value: T): T;
function cpuFirstTrailingBit<T extends AnyIntegerVecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const firstTrailingBit = /*#__PURE__*/ dualImpl<typeof cpuFirstTrailingBit>({
  name: 'firstTrailingBit',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyConcreteInteger),
  normalImpl:
    'CPU implementation for firstTrailingBit not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`firstTrailingBit(${value})`,
  sideEffects: false,
});

function cpuFloor(value: number): number;
function cpuFloor<T extends AnyFloatVecInstance>(value: T): T;
function cpuFloor<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.floor, [value]);
}

export const floor = /*#__PURE__*/ dualImpl({
  name: 'floor',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuFloor,
  codegenImpl: (_ctx, [arg]) => stitch`floor(${arg})`,
  sideEffects: false,
});

function cpuFma(e1: number, e2: number, e3: number): number;
function cpuFma<T extends AnyFloatVecInstance>(e1: T, e2: T, e3: T): T;
function cpuFma<T extends AnyFloatVecInstance | number>(e1: T, e2: T, e3: T): T {
  assertKind([e1, e2, e3], floatKind);
  assertEqualKinds(e1, e2, e3);
  if (typeof e1 === 'number') {
    return (e1 * (e2 as number) + (e3 as number)) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for fma on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const fma = /*#__PURE__*/ dualImpl({
  name: 'fma',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuFma,
  codegenImpl: (_ctx, [e1, e2, e3]) => stitch`fma(${e1}, ${e2}, ${e3})`,
  sideEffects: false,
});

function cpuFract(value: number): number;
function cpuFract<T extends AnyFloatVecInstance>(value: T): T;
function cpuFract<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn((value) => value - Math.floor(value), [value]);
}

export const fract = /*#__PURE__*/ dualImpl({
  name: 'fract',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuFract,
  codegenImpl: (_ctx, [a]) => stitch`fract(${a})`,
  sideEffects: false,
});

const FrexpResults = {
  f32: /*#__PURE__*/ abstruct({ fract: f32, exp: i32 }),
  f16: /*#__PURE__*/ abstruct({ fract: f16, exp: i32 }),
  abstractFloat: /*#__PURE__*/ abstruct({ fract: abstractFloat, exp: abstractInt }),
  vec2f: /*#__PURE__*/ abstruct({ fract: vec2f, exp: vec2i }),
  vec3f: /*#__PURE__*/ abstruct({ fract: vec3f, exp: vec3i }),
  vec4f: /*#__PURE__*/ abstruct({ fract: vec4f, exp: vec4i }),
  vec2h: /*#__PURE__*/ abstruct({ fract: vec2h, exp: vec2i }),
  vec3h: /*#__PURE__*/ abstruct({ fract: vec3h, exp: vec3i }),
  vec4h: /*#__PURE__*/ abstruct({ fract: vec4h, exp: vec4i }),
} as const;

type FrexpOverload = {
  (value: number): Infer<(typeof FrexpResults)['f32']>;
  <T extends AnyFloatVecInstance>(value: T): Infer<(typeof FrexpResults)[T['kind']]>;
};

export const frexp = /*#__PURE__*/ dualImpl<FrexpOverload>({
  name: 'frexp',
  normalImpl:
    'CPU implementation for frexp not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  signature: (value) => {
    const returnType = FrexpResults[value.type as keyof typeof FrexpResults];

    if (!returnType) {
      throw new SignatureNotSupportedError([value], anyFloat);
    }

    return { argTypes: [value], returnType };
  },
  codegenImpl: (_ctx, [value]) => stitch`frexp(${value})`,
  sideEffects: false,
});

function cpuInsertBits(e: number, newbits: number, offset: number, count: number): number;
function cpuInsertBits<T extends AnyIntegerVecInstance>(
  e: T,
  newbits: T,
  offset: number,
  count: number,
): T;
function cpuInsertBits<T extends AnyIntegerVecInstance | number>(
  _e: T,
  _newbits: T,
  _offset: number,
  _count: number,
): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const insertBits = /*#__PURE__*/ dualImpl<typeof cpuInsertBits>({
  name: 'insertBits',
  signature: (e, newbits, _offset, _count) => {
    const uargs = unify([e, newbits], anyConcreteInteger);
    if (!uargs) {
      throw new SignatureNotSupportedError([e, newbits], anyConcreteInteger);
    }
    return {
      argTypes: [...uargs, u32, u32],
      returnType: uargs[0],
    };
  },
  normalImpl:
    'CPU implementation for insertBits not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [e, newbits, offset, count]) =>
    stitch`insertBits(${e}, ${newbits}, ${offset}, ${count})`,
  sideEffects: false,
});

function cpuInverseSqrt(value: number): number;
function cpuInverseSqrt<T extends AnyFloatVecInstance>(value: T): T;
function cpuInverseSqrt<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  if (typeof value === 'number') {
    return (1 / Math.sqrt(value)) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for inverseSqrt on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const inverseSqrt = /*#__PURE__*/ dualImpl({
  name: 'inverseSqrt',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuInverseSqrt,
  codegenImpl: (ctx, [value]) => ctx.gen.emitCall('inverseSqrt', [], [value]),
  sideEffects: false,
});

function cpuLdexp(e1: number, e2: number): number;
function cpuLdexp<T extends v2f | v2h>(e1: T, e2: v2i): T;
function cpuLdexp<T extends v3f | v3h>(e1: T, e2: v3i): T;
function cpuLdexp<T extends v4f | v4h>(e1: T, e2: v4i): T;
function cpuLdexp<T extends AnyFloatVecInstance | number>(
  _e1: T,
  _e2: AnyIntegerVecInstance | number,
): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const ldexp = /*#__PURE__*/ dualImpl<typeof cpuLdexp>({
  name: 'ldexp',
  signature: (e1, _e2) => {
    switch (e1.type) {
      case 'abstractFloat':
        return { argTypes: [e1, abstractInt], returnType: e1 };
      case 'f32':
      case 'f16':
        return { argTypes: [e1, i32], returnType: e1 };
      case 'vec2f':
      case 'vec2h':
        return { argTypes: [e1, vec2i], returnType: e1 };
      case 'vec3f':
      case 'vec3h':
        return { argTypes: [e1, vec3i], returnType: e1 };
      case 'vec4f':
      case 'vec4h':
        return { argTypes: [e1, vec4i], returnType: e1 };
      default:
        throw new Error(
          `Unsupported data type for ldexp: ${e1.type}. Supported types are abstractFloat, f32, f16, vec2f, vec2h, vec3f, vec3h, vec4f, vec4h.`,
        );
    }
  },
  normalImpl:
    'CPU implementation for ldexp not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [e1, e2]) => stitch`ldexp(${e1}, ${e2})`,
  sideEffects: false,
});

function cpuLength(value: number): number;
function cpuLength<T extends AnyFloatVecInstance>(value: T): number;
function cpuLength<T extends AnyFloatVecInstance | number>(value: T): number {
  assertKind(value, floatKind);
  if (typeof value === 'number') {
    return Math.abs(value);
  }
  return VectorOps.length[value.kind](value);
}

export const length = /*#__PURE__*/ dualImpl({
  name: 'length',
  signature: (arg) => {
    const uarg = unify([arg], anyFloat);
    if (!uarg) {
      throw new SignatureNotSupportedError([arg], anyFloat);
    }
    return {
      argTypes: uarg,
      returnType: isHalfPrecisionSchema(uarg[0]) ? f16 : f32,
    };
  },
  normalImpl: cpuLength,
  codegenImpl: (_ctx, [arg]) => stitch`length(${arg})`,
  sideEffects: false,
});

function cpuLog(value: number): number;
function cpuLog<T extends AnyFloatVecInstance>(value: T): T;
function cpuLog<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.log, [value]);
}

export const log = /*#__PURE__*/ dualImpl({
  name: 'log',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuLog,
  codegenImpl: (_ctx, [value]) => stitch`log(${value})`,
  sideEffects: false,
});

function cpuLog2(value: number): number;
function cpuLog2<T extends AnyFloatVecInstance>(value: T): T;
function cpuLog2<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.log2, [value]);
}

export const log2 = /*#__PURE__*/ dualImpl({
  name: 'log2',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuLog2,
  codegenImpl: (_ctx, [value]) => stitch`log2(${value})`,
  sideEffects: false,
});

function cpuMax(a: number, b: number): number;
function cpuMax<T extends NumVec>(a: T, b: T): T;
function cpuMax<T extends NumVec | number>(a: T, b: T): T {
  assertKind([a, b], numericKind);
  assertEqualKinds(a, b);
  return generalizeFn(Math.max, [a, b]);
}

type VariadicOverload = {
  (fst: number, ...rest: number[]): number;
  <T extends NumVec>(fst: T, ...rest: T[]): T;
};

export const max = /*#__PURE__*/ dualImpl({
  name: 'max',
  signature: variadicUnifySignature,
  normalImpl: /*#__PURE__*/ variadicReduce(cpuMax) as VariadicOverload,
  codegenImpl: /*#__PURE__*/ variadicStitch('max'),
  sideEffects: false,
});

function cpuMin(a: number, b: number): number;
function cpuMin<T extends NumVec>(a: T, b: T): T;
function cpuMin<T extends NumVec | number>(a: T, b: T): T {
  assertKind([a, b], numericKind);
  assertEqualKinds(a, b);
  return generalizeFn(Math.min, [a, b]);
}

export const min = /*#__PURE__*/ dualImpl({
  name: 'min',
  signature: variadicUnifySignature,
  normalImpl: /*#__PURE__*/ variadicReduce(cpuMin) as VariadicOverload,
  codegenImpl: /*#__PURE__*/ variadicStitch('min'),
  sideEffects: false,
});

function cpuMix(e1: number, e2: number, e3: number): number;
function cpuMix<T extends AnyFloatVecInstance>(e1: T, e2: T, e3: number): T;
function cpuMix<T extends AnyFloatVecInstance>(e1: T, e2: T, e3: T): T;
function cpuMix<T extends AnyFloatVecInstance | number>(e1: T, e2: T, e3: T): T {
  assertKind([e1, e2, e3], floatKind);
  if (typeof e3 === 'number') {
    assertEqualKinds(e1, e2);
  } else {
    assertEqualKinds(e1, e2, e3);
  }
  return generalizeFn((e1, e2, e3) => e1 * (1 - e3) + e2 * e3, [e1, ...upCast([e2, e3])]);
}

export const mix = /*#__PURE__*/ dualImpl({
  name: 'mix',
  signature: (e1, e2, e3) => {
    if (e1.type.startsWith('vec') && !e3.type.startsWith('vec')) {
      const uarg = unify([e3], [(e1 as unknown as Vec2f).primitive]);
      if (!uarg) {
        throw new SignatureNotSupportedError([e3], [(e1 as unknown as Vec2f).primitive]);
      }
      return { argTypes: [e1, e2, uarg[0]], returnType: e1 };
    }
    const uargs = unify([e1, e2, e3], anyFloat);
    if (!uargs) {
      throw new SignatureNotSupportedError([e1, e2, e3], anyFloat);
    }
    return { argTypes: uargs, returnType: uargs[0] };
  },
  normalImpl: cpuMix,
  codegenImpl: (_ctx, [e1, e2, e3]) => stitch`mix(${e1}, ${e2}, ${e3})`,
  sideEffects: false,
});

const ModfResult = {
  f32: /*#__PURE__*/ abstruct({ fract: f32, whole: f32 }),
  f16: /*#__PURE__*/ abstruct({ fract: f16, whole: f16 }),
  abstractFloat: /*#__PURE__*/ abstruct({ fract: abstractFloat, whole: abstractFloat }),
  vec2f: /*#__PURE__*/ abstruct({ fract: vec2f, whole: vec2f }),
  vec3f: /*#__PURE__*/ abstruct({ fract: vec3f, whole: vec3f }),
  vec4f: /*#__PURE__*/ abstruct({ fract: vec4f, whole: vec4f }),
  vec2h: /*#__PURE__*/ abstruct({ fract: vec2h, whole: vec2h }),
  vec3h: /*#__PURE__*/ abstruct({ fract: vec3h, whole: vec3h }),
  vec4h: /*#__PURE__*/ abstruct({ fract: vec4h, whole: vec4h }),
} as const;

type ModfOverload = {
  (value: number): Infer<(typeof ModfResult)['f32']>;
  <T extends AnyFloatVecInstance>(value: T): Infer<(typeof ModfResult)[T['kind']]>;
};
function cpuModf(e: number): Infer<(typeof ModfResult)['f32']>;
function cpuModf<T extends AnyFloatVecInstance>(e: T): Infer<(typeof ModfResult)[T['kind']]>;
function cpuModf<T extends AnyFloatVecInstance | number>(
  _value: T,
): Infer<(typeof ModfResult)[keyof typeof ModfResult]> {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const modf: ModfOverload = /*#__PURE__*/ dualImpl<typeof cpuModf>({
  name: 'modf',
  signature: (e) => {
    const returnType = ModfResult[e.type as keyof typeof ModfResult];

    if (!returnType) {
      throw new Error(
        `Unsupported data type for modf: ${e.type}. Supported types are f32, f16, abstractFloat, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h.`,
      );
    }

    return { argTypes: [e], returnType };
  },
  normalImpl:
    'CPU implementation for modf not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`modf(${value})`,
  sideEffects: false,
});

export const normalize = /*#__PURE__*/ dualImpl({
  name: 'normalize',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloatVec),
  normalImpl: <T extends AnyFloatVecInstance>(v: T): T => {
    assertKind(v, floatKind);
    const len = length(v);
    return generalizeFn((e) => e / len, [v]);
  },
  codegenImpl: (_ctx, [value]) => stitch`normalize(${value})`,
  sideEffects: false,
});

function powCpu(base: number, exponent: number): number;
function powCpu<T extends AnyFloatVecInstance>(base: T, exponent: T): T;
function powCpu<T extends AnyFloatVecInstance | number>(base: T, exponent: T): T {
  assertKind([base, exponent], floatKind);
  assertEqualKinds(base, exponent);
  return generalizeFn((a, b) => a ** b, [base, exponent]);
}

export const pow = /*#__PURE__*/ dualImpl({
  name: 'pow',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: powCpu,
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`pow(${lhs}, ${rhs})`,
  sideEffects: false,
});

export const powOperator = /*#__PURE__*/ dualImpl({
  name: 'pow',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: powCpu,
  codegenImpl: (ctx, [lhs, rhs], returnType) => {
    const call = (name: string, ...args: Snippet[]) =>
      snip(
        ctx.gen.emitCall(name, [], args),
        returnType,
        'runtime',
        args.some((a) => a.possibleSideEffects),
      );

    const exponent = (asComptime(rhs)?.value ?? NaN) as number | AnyFloatVecInstance;
    const k =
      isVecInstance(exponent) && exponent.every((e) => e === exponent[0]) ? exponent[0] : exponent;
    if (typeof k !== 'number' || !Number.isInteger(k)) {
      return ctx.gen.emitCall('pow', [], [lhs, rhs]);
    }
    if (lhs.possibleSideEffects) {
      // The forms below repeat or drop the base, so only these evaluate it exactly once
      return ctx.gen.emitCall('pow', [], [k % 2 === 0 ? call('abs', lhs) : lhs, rhs]);
    }
    if (k === 0) {
      return ctx.resolveSnippet(
        withValue(
          generalizeFn(() => 1, [exponent]),
          rhs,
        ),
      ).value;
    }
    if (k === 1) {
      return ctx.resolveSnippet(lhs).value;
    }
    if (k === 2) {
      return ctx.gen.emitBinaryOp(lhs, '*', lhs);
    }
    const magnitude = call('pow', call('abs', lhs), rhs);
    if (k % 2 === 0) {
      return magnitude.value;
    }
    return ctx.gen.emitBinaryOp(call('sign', lhs), '*', magnitude);
  },
  sideEffects: false,
});

function cpuQuantizeToF16(value: number): number;
function cpuQuantizeToF16<T extends AnyFloat32VecInstance>(value: T): T;
function cpuQuantizeToF16<T extends AnyFloat32VecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const quantizeToF16 = /*#__PURE__*/ dualImpl<typeof cpuQuantizeToF16>({
  name: 'quantizeToF16',
  signature: (arg) => {
    const candidates = [vec2f, vec3f, vec4f, f32];
    const uarg = unify([arg], candidates)?.[0];
    if (!uarg) {
      throw new SignatureNotSupportedError([arg], candidates);
    }
    return { argTypes: [uarg], returnType: uarg };
  },
  normalImpl:
    'CPU implementation for quantizeToF16 not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`quantizeToF16(${value})`,
  sideEffects: false,
});

function cpuRadians(value: number): number;
function cpuRadians<T extends AnyFloatVecInstance | number>(value: T): T;
function cpuRadians<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  if (typeof value === 'number') {
    return ((value * Math.PI) / 180) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for radians on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const radians = /*#__PURE__*/ dualImpl({
  name: 'radians',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuRadians,
  codegenImpl: (_ctx, [value]) => stitch`radians(${value})`,
  sideEffects: false,
});

export const reflect = /*#__PURE__*/ dualImpl({
  name: 'reflect',
  signature: (...args) => {
    const uargs = unify(args, anyFloatVec);
    if (!uargs) {
      throw new SignatureNotSupportedError(args, anyFloatVec);
    }
    return {
      argTypes: uargs,
      returnType: uargs[0],
    };
  },
  normalImpl: <T extends AnyFloatVecInstance>(e1: T, e2: T): T => {
    assertKind([e1, e2], floatKind, true);
    assertEqualKinds(e1, e2);
    return sub(e1, mul(2 * dot(e2, e1), e2));
  },
  codegenImpl: (_ctx, [e1, e2]) => stitch`reflect(${e1}, ${e2})`,
  sideEffects: false,
});

export const refract = /*#__PURE__*/ dualImpl<
  <T extends AnyFloatVecInstance>(e1: T, e2: T, e3: number) => T
>({
  name: 'refract',
  normalImpl:
    'CPU implementation for refract not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [e1, e2, e3]) => stitch`refract(${e1}, ${e2}, ${e3})`,
  signature: (e1, e2, _e3) => ({
    argTypes: [e1, e2, isHalfPrecisionSchema(e1) ? f16 : f32],
    returnType: e1,
  }),
  sideEffects: false,
});
function cpuReverseBits(value: number): number;
function cpuReverseBits<T extends AnyIntegerVecInstance>(value: T): T;
function cpuReverseBits<T extends AnyIntegerVecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const reverseBits = /*#__PURE__*/ dualImpl<typeof cpuReverseBits>({
  name: 'reverseBits',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyConcreteInteger),
  normalImpl:
    'CPU implementation for reverseBits not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`reverseBits(${value})`,
  sideEffects: false,
});

function cpuRound(value: number): number;
function cpuRound<T extends AnyFloatVecInstance>(value: T): T;
function cpuRound<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  if (typeof value === 'number') {
    const floor = Math.floor(value);
    if (value === floor + 0.5) {
      if (floor % 2 === 0) {
        return floor as T;
      }
      return (floor + 1) as T;
    }
    return Math.round(value) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for round on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const round = /*#__PURE__*/ dualImpl({
  name: 'round',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuRound,
  codegenImpl: (_ctx, [value]) => stitch`round(${value})`,
  sideEffects: false,
});

function cpuSaturate(value: number): number;
function cpuSaturate<T extends AnyFloatVecInstance>(value: T): T;
function cpuSaturate<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn((value) => clampScalar(value, 0, 1), [value]);
}

export const saturate = /*#__PURE__*/ dualImpl({
  name: 'saturate',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuSaturate,
  codegenImpl: (ctx, [value]) => ctx.gen.emitCall('saturate', [], [value]),
  sideEffects: false,
});

function cpuSign(e: number): number;
function cpuSign<T extends AnySignedVecInstance>(e: T): T;
function cpuSign<T extends AnySignedVecInstance | number>(e: T): T {
  assertKind(e, signedKind);
  return generalizeFn(Math.sign, [e]);
}

export const sign = /*#__PURE__*/ dualImpl({
  name: 'sign',
  signature: (arg) => {
    const candidates = [...anyFloat, i32, vec2i, vec3i, vec4i];
    const uarg = unify([arg], candidates)?.[0];
    if (!uarg) {
      throw new SignatureNotSupportedError([arg], candidates);
    }
    return { argTypes: [uarg], returnType: uarg };
  },
  normalImpl: cpuSign,
  codegenImpl: (_ctx, [e]) => stitch`sign(${e})`,
  sideEffects: false,
});

function cpuSin(value: number): number;
function cpuSin<T extends AnyFloatVecInstance>(value: T): T;
function cpuSin<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.sin, [value]);
}

export const sin = /*#__PURE__*/ dualImpl({
  name: 'sin',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuSin,
  codegenImpl: (_ctx, [value]) => stitch`sin(${value})`,
  sideEffects: false,
});

function cpuSinh(value: number): number;
function cpuSinh<T extends AnyFloatVecInstance>(value: T): T;
function cpuSinh<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.sinh, [value]);
}

export const sinh = /*#__PURE__*/ dualImpl({
  name: 'sinh',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuSinh,
  codegenImpl: (_ctx, [value]) => stitch`sinh(${value})`,
  sideEffects: false,
});

function cpuSmoothstep(edge0: number, edge1: number, x: number): number;
function cpuSmoothstep<T extends AnyFloatVecInstance>(edge0: T, edge1: T, x: T): T;
function cpuSmoothstep<T extends AnyFloatVecInstance | number>(edge0: T, edge1: T, x: T): T {
  assertKind([edge0, edge1, x], floatKind);
  assertEqualKinds(edge0, edge1, x);
  return generalizeFn(smoothstepScalar, [edge0, edge1, x]);
}

export const smoothstep = /*#__PURE__*/ dualImpl({
  name: 'smoothstep',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuSmoothstep,
  codegenImpl: (_ctx, [edge0, edge1, x]) => stitch`smoothstep(${edge0}, ${edge1}, ${x})`,
  sideEffects: false,
});

function cpuSqrt(value: number): number;
function cpuSqrt<T extends AnyFloatVecInstance>(value: T): T;
function cpuSqrt<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.sqrt, [value]);
}

export const sqrt = /*#__PURE__*/ dualImpl({
  name: 'sqrt',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuSqrt,
  codegenImpl: (_ctx, [value]) => stitch`sqrt(${value})`,
  sideEffects: false,
});

function cpuStep(edge: number, x: number): number;
function cpuStep<T extends AnyFloatVecInstance | number>(edge: T, x: T): T;
function cpuStep<T extends AnyFloatVecInstance | number>(edge: T, x: T): T {
  assertKind([edge, x], floatKind);
  assertEqualKinds(edge, x);
  if (typeof edge === 'number') {
    return (edge <= (x as number) ? 1.0 : 0.0) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for step on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const step = /*#__PURE__*/ dualImpl({
  name: 'step',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuStep,
  codegenImpl: (_ctx, [edge, x]) => stitch`step(${edge}, ${x})`,
  sideEffects: false,
});

function cpuTan(value: number): number;
function cpuTan<T extends AnyFloatVecInstance>(value: T): T;
function cpuTan<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  if (typeof value === 'number') {
    return Math.tan(value) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for tan on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const tan = /*#__PURE__*/ dualImpl({
  name: 'tan',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuTan,
  codegenImpl: (_ctx, [value]) => stitch`tan(${value})`,
  sideEffects: false,
});

function cpuTanh(value: number): number;
function cpuTanh<T extends AnyFloatVecInstance>(value: T): T;
function cpuTanh<T extends AnyFloatVecInstance | number>(value: T): T {
  assertKind(value, floatKind);
  return generalizeFn(Math.tanh, [value]);
}

export const tanh = /*#__PURE__*/ dualImpl({
  name: 'tanh',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl: cpuTanh,
  codegenImpl: (_ctx, [value]) => stitch`tanh(${value})`,
  sideEffects: false,
});

function cpuTranspose<T extends AnyMatInstance>(value: T): T {
  assertKind(value, matrixKind);
  const schema = WORKAROUND_getSchema(value);
  // NOTE: This assumes all matrices are square
  const transposed = schema() as T;
  const src = value.columns;
  const dst = transposed.columns;

  if (src.length === 2) {
    dst[0][0] = src[0][0];
    dst[0][1] = src[1][0];

    dst[1][0] = src[0][1];
    dst[1][1] = src[1][1];
  } else if (src.length === 3) {
    dst[0][0] = src[0][0];
    dst[0][1] = src[1][0];
    dst[0][2] = src[2][0];

    dst[1][0] = src[0][1];
    dst[1][1] = src[1][1];
    dst[1][2] = src[2][1];

    // oxlint-disable-next-line typescript/no-non-null-assertion
    const dst2 = dst[2]!;
    dst2[0] = src[0][2];
    dst2[1] = src[1][2];
    dst2[2] = src[2][2];
  } else if (src.length === 4) {
    dst[0][0] = src[0][0];
    dst[0][1] = src[1][0];
    dst[0][2] = src[2][0];
    dst[0][3] = src[3][0];

    dst[1][0] = src[0][1];
    dst[1][1] = src[1][1];
    dst[1][2] = src[2][1];
    dst[1][3] = src[3][1];

    // oxlint-disable-next-line typescript/no-non-null-assertion
    const dst2 = dst[2]!;
    dst2[0] = src[0][2];
    dst2[1] = src[1][2];
    dst2[2] = src[2][2];
    dst2[3] = src[3][2];

    // oxlint-disable-next-line typescript/no-non-null-assertion
    const dst3 = dst[3]!;
    dst3[0] = src[0][3];
    dst3[1] = src[1][3];
    dst3[2] = src[2][3];
    dst3[3] = src[3][3];
  } else {
    assertExhaustive(src, 'std/numeric.ts#cpuTranspose');
  }

  return transposed;
}

export const transpose = /*#__PURE__*/ dualImpl({
  name: 'transpose',
  signature: unaryIdentitySignature,
  normalImpl: cpuTranspose,
  codegenImpl: (_ctx, [e]) => stitch`transpose(${e})`,
  sideEffects: false,
});

function cpuTrunc(value: number): number;
function cpuTrunc<T extends AnyFloatVecInstance>(value: T): T;
function cpuTrunc<T extends AnyFloatVecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const trunc = /*#__PURE__*/ dualImpl<typeof cpuTrunc>({
  name: 'trunc',
  signature: /*#__PURE__*/ unifyRestrictedSignature(anyFloat),
  normalImpl:
    'CPU implementation for trunc not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`trunc(${value})`,
  sideEffects: false,
});

function cpuIntdiv(lhs: number, rhs: number): number {
  if (typeof lhs !== 'number' || typeof rhs !== 'number') {
    throw new Error('std.intdiv called with invalid arguments.');
  }
  return Math.trunc(Math.trunc(lhs) / Math.trunc(rhs));
}

/**
 * Performs integer division on the passed in scalars.
 * Equivalent to `trunc(trunc(lhs) / trunc(rhs))`. Coerces both
 * arguments to integers if they're floating point.
 */
export const intdiv = /*#__PURE__*/ dualImpl({
  name: 'intdiv',
  signature: (lhs, rhs) => {
    const unified = unify([lhs, rhs], [i32, u32]);
    if (!unified) {
      throw new SignatureNotSupportedError([lhs, rhs], [i32, u32, abstractInt]);
    }
    return { argTypes: unified, returnType: unified[0] };
  },
  normalImpl: cpuIntdiv,
  codegenImpl: (ctx, [lhs, rhs]) => ctx.gen.emitBinaryOp(lhs, '/', rhs),
  sideEffects: false,
});
