import { dualImpl, MissingCpuImplError } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { mat2x2f, mat3x3f, mat4x4f } from '../data/matrix.ts';
import { smoothstepScalar } from '../data/numberOps.ts';
import { abstractFloat, abstractInt, f16, f32, i32, u32 } from '../data/numeric.ts';
import type { Snippet } from '../data/snippet.ts';
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
} from '../data/wgslTypes.ts';
import { SignatureNotSupportedError } from '../errors.ts';
import type { Infer } from '../shared/repr.ts';
import { unify } from '../tgsl/conversion.ts';
import type { ResolutionCtx } from '../types.ts';
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

const unifyRestrictedSignature =
  (restrict: BaseData[]) =>
  (...args: BaseData[]) => {
    const uargs = unify(args, restrict);
    if (!uargs) {
      throw new SignatureNotSupportedError(args, restrict);
    }
    return {
      argTypes: uargs,
      returnType: uargs[0] as BaseData,
    };
  };

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
  return (_ctx: ResolutionCtx, [fst, ...rest]: [fst: Snippet, ...rest: Snippet[]]): string => {
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
  if (typeof value === 'number') {
    return Math.abs(value) as T;
  }
  return VectorOps.abs[value.kind](value) as T;
}

export const abs = dualImpl({
  name: 'abs',
  signature: unaryIdentitySignature,
  normalImpl: cpuAbs,
  codegenImpl: (_ctx, [value]) => stitch`abs(${value})`,
});

function cpuAcos(value: number): number;
function cpuAcos<T extends AnyFloatVecInstance>(value: T): T;
function cpuAcos<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.acos(value) as T;
  }
  return VectorOps.acos[value.kind](value) as T;
}

export const acos = dualImpl({
  name: 'acos',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuAcos,
  codegenImpl: (_ctx, [value]) => stitch`acos(${value})`,
});

function cpuAcosh(value: number): number;
function cpuAcosh<T extends AnyFloatVecInstance>(value: T): T;
function cpuAcosh<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.acosh(value) as T;
  }
  return VectorOps.acosh[value.kind](value) as T;
}

export const acosh = dualImpl({
  name: 'acosh',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuAcosh,
  codegenImpl: (_ctx, [value]) => stitch`acosh(${value})`,
});

function cpuAsin(value: number): number;
function cpuAsin<T extends AnyFloatVecInstance>(value: T): T;
function cpuAsin<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.asin(value) as T;
  }
  return VectorOps.asin[value.kind](value) as T;
}

export const asin = dualImpl({
  name: 'asin',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuAsin,
  codegenImpl: (_ctx, [value]) => stitch`asin(${value})`,
});

function cpuAsinh(value: number): number;
function cpuAsinh<T extends AnyFloatVecInstance>(value: T): T;
function cpuAsinh<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.asinh(value) as T;
  }
  return VectorOps.asinh[value.kind](value) as T;
}

export const asinh = dualImpl({
  name: 'asinh',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuAsinh,
  codegenImpl: (_ctx, [value]) => stitch`asinh(${value})`,
});

function cpuAtan(value: number): number;
function cpuAtan<T extends AnyFloatVecInstance>(value: T): T;
function cpuAtan<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.atan(value) as T;
  }
  return VectorOps.atan[value.kind](value) as T;
}

export const atan = dualImpl({
  name: 'atan',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuAtan,
  codegenImpl: (_ctx, [value]) => stitch`atan(${value})`,
});

function cpuAtanh(value: number): number;
function cpuAtanh<T extends AnyFloatVecInstance>(value: T): T;
function cpuAtanh<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.atanh(value) as T;
  }
  return VectorOps.atanh[value.kind](value) as T;
}

export const atanh = dualImpl({
  name: 'atanh',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuAtanh,
  codegenImpl: (_ctx, [value]) => stitch`atanh(${value})`,
});

function cpuAtan2(y: number, x: number): number;
function cpuAtan2<T extends AnyFloatVecInstance>(y: T, x: T): T;
function cpuAtan2<T extends AnyFloatVecInstance | number>(y: T, x: T): T {
  if (typeof y === 'number' && typeof x === 'number') {
    return Math.atan2(y, x) as T;
  }
  return VectorOps.atan2[(y as AnyFloatVecInstance).kind](y as never, x as never) as T;
}

export const atan2 = dualImpl({
  name: 'atan2',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuAtan2,
  codegenImpl: (_ctx, [y, x]) => stitch`atan2(${y}, ${x})`,
});

function cpuCeil(value: number): number;
function cpuCeil<T extends AnyFloatVecInstance>(value: T): T;
function cpuCeil<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.ceil(value) as T;
  }
  return VectorOps.ceil[value.kind](value) as T;
}

export const ceil = dualImpl({
  name: 'ceil',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuCeil,
  codegenImpl: (_ctx, [value]) => stitch`ceil(${value})`,
});

function cpuClamp(value: number, low: number, high: number): number;
function cpuClamp<T extends NumVec | number>(value: T, low: T, high: T): T;
function cpuClamp<T extends NumVec | number>(value: T, low: T, high: T): T {
  if (typeof value === 'number') {
    return Math.min(Math.max(low as number, value), high as number) as T;
  }
  return VectorOps.clamp[value.kind](value, low as NumVec, high as NumVec) as T;
}

export const clamp = dualImpl({
  name: 'clamp',
  signature: variadicUnifySignature,
  normalImpl: cpuClamp,
  codegenImpl: (_ctx, [value, low, high]) => stitch`clamp(${value}, ${low}, ${high})`,
});

function cpuCos(value: number): number;
function cpuCos<T extends AnyFloatVecInstance>(value: T): T;
function cpuCos<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.cos(value) as T;
  }
  return VectorOps.cos[value.kind](value) as T;
}

export const cos = dualImpl({
  name: 'cos',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuCos,
  codegenImpl: (_ctx, [value]) => stitch`cos(${value})`,
});

function cpuCosh(value: number): number;
function cpuCosh<T extends AnyFloatVecInstance>(value: T): T;
function cpuCosh<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.cosh(value) as T;
  }
  return VectorOps.cosh[value.kind](value) as T;
}

export const cosh = dualImpl({
  name: 'cosh',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuCosh,
  codegenImpl: (_ctx, [value]) => stitch`cosh(${value})`,
});

function cpuCountLeadingZeros(value: number): number;
function cpuCountLeadingZeros<T extends AnyIntegerVecInstance>(value: T): T;
function cpuCountLeadingZeros<T extends AnyIntegerVecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const countLeadingZeros = dualImpl<typeof cpuCountLeadingZeros>({
  name: 'countLeadingZeros',
  signature: unifyRestrictedSignature(anyConcreteInteger),
  normalImpl:
    'CPU implementation for countLeadingZeros not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`countLeadingZeros(${value})`,
});

function cpuCountOneBits(value: number): number;
function cpuCountOneBits<T extends AnyIntegerVecInstance>(value: T): T;
function cpuCountOneBits<T extends AnyIntegerVecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const countOneBits = dualImpl<typeof cpuCountOneBits>({
  name: 'countOneBits',
  signature: unifyRestrictedSignature(anyConcreteInteger),
  normalImpl:
    'CPU implementation for countOneBits not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`countOneBits(${value})`,
});

function cpuCountTrailingZeros(value: number): number;
function cpuCountTrailingZeros<T extends AnyIntegerVecInstance>(value: T): T;
function cpuCountTrailingZeros<T extends AnyIntegerVecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const countTrailingZeros = dualImpl<typeof cpuCountTrailingZeros>({
  name: 'countTrailingZeros',
  signature: unifyRestrictedSignature(anyConcreteInteger),
  normalImpl:
    'CPU implementation for countTrailingZeros not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`countTrailingZeros(${value})`,
});

export const cross = dualImpl({
  name: 'cross',
  signature: unifyRestrictedSignature([vec3f, vec3h]),
  normalImpl: <T extends v3f | v3h>(a: T, b: T): T => VectorOps.cross[a.kind](a, b),
  codegenImpl: (_ctx, [a, b]) => stitch`cross(${a}, ${b})`,
});

function cpuDegrees(value: number): number;
function cpuDegrees<T extends AnyFloatVecInstance>(value: T): T;
function cpuDegrees<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return ((value * 180) / Math.PI) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for degrees on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const degrees = dualImpl<typeof cpuDegrees>({
  name: 'degrees',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuDegrees,
  codegenImpl: (_ctx, [value]) => stitch`degrees(${value})`,
});

export const determinant = dualImpl<(value: AnyMatInstance) => number>({
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
});

function cpuDistance(a: number, b: number): number;
function cpuDistance<T extends AnyFloatVecInstance>(a: T, b: T): number;
function cpuDistance<T extends AnyFloatVecInstance | number>(a: T, b: T): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b);
  }
  return length(sub(a as AnyFloatVecInstance, b as AnyFloatVecInstance));
}

export const distance = dualImpl({
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
});

export const dot = dualImpl({
  name: 'dot',
  signature: (...args) => ({
    argTypes: args,
    returnType: (args[0] as VecData).primitive,
  }),
  normalImpl: <T extends NumVec>(lhs: T, rhs: T): number => VectorOps.dot[lhs.kind](lhs, rhs),
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`dot(${lhs}, ${rhs})`,
});

export const dot4U8Packed = dualImpl<(e1: number, e2: number) => number>({
  name: 'dot4U8Packed',
  signature: { argTypes: [u32, u32], returnType: u32 },
  normalImpl:
    'CPU implementation for dot4U8Packed not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [e1, e2]) => stitch`dot4U8Packed(${e1}, ${e2})`,
});

export const dot4I8Packed = dualImpl<(e1: number, e2: number) => number>({
  name: 'dot4I8Packed',
  signature: { argTypes: [u32, u32], returnType: i32 },
  normalImpl:
    'CPU implementation for dot4I8Packed not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [e1, e2]) => stitch`dot4I8Packed(${e1}, ${e2})`,
});

function cpuExp(value: number): number;
function cpuExp<T extends AnyFloatVecInstance>(value: T): T;
function cpuExp<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.exp(value) as T;
  }
  return VectorOps.exp[value.kind](value) as T;
}

export const exp = dualImpl({
  name: 'exp',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuExp,
  codegenImpl: (_ctx, [value]) => stitch`exp(${value})`,
});

function cpuExp2(value: number): number;
function cpuExp2<T extends AnyFloatVecInstance>(value: T): T;
function cpuExp2<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return (2 ** value) as T;
  }
  return VectorOps.exp2[value.kind](value) as T;
}

export const exp2 = dualImpl({
  name: 'exp2',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuExp2,
  codegenImpl: (_ctx, [value]) => stitch`exp2(${value})`,
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

export const extractBits = dualImpl<typeof cpuExtractBits>({
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
});

export const faceForward = dualImpl<<T extends AnyFloatVecInstance>(e1: T, e2: T, e3: T) => T>({
  name: 'faceForward',
  signature: unifyRestrictedSignature(anyFloatVec),
  normalImpl:
    'CPU implementation for faceForward not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [e1, e2, e3]) => stitch`faceForward(${e1}, ${e2}, ${e3})`,
});

function cpuFirstLeadingBit(value: number): number;
function cpuFirstLeadingBit<T extends AnyIntegerVecInstance>(value: T): T;
function cpuFirstLeadingBit<T extends AnyIntegerVecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const firstLeadingBit = dualImpl<typeof cpuFirstLeadingBit>({
  name: 'firstLeadingBit',
  signature: unaryIdentitySignature,
  normalImpl:
    'CPU implementation for firstLeadingBit not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`firstLeadingBit(${value})`,
});

function cpuFirstTrailingBit(value: number): number;
function cpuFirstTrailingBit<T extends AnyIntegerVecInstance>(value: T): T;
function cpuFirstTrailingBit<T extends AnyIntegerVecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const firstTrailingBit = dualImpl<typeof cpuFirstTrailingBit>({
  name: 'firstTrailingBit',
  signature: unifyRestrictedSignature(anyConcreteInteger),
  normalImpl:
    'CPU implementation for firstTrailingBit not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`firstTrailingBit(${value})`,
});

function cpuFloor(value: number): number;
function cpuFloor<T extends AnyFloatVecInstance>(value: T): T;
function cpuFloor<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.floor(value) as T;
  }
  return VectorOps.floor[value.kind](value) as T;
}

export const floor = dualImpl({
  name: 'floor',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuFloor,
  codegenImpl: (_ctx, [arg]) => stitch`floor(${arg})`,
});

function cpuFma(e1: number, e2: number, e3: number): number;
function cpuFma<T extends AnyFloatVecInstance>(e1: T, e2: T, e3: T): T;
function cpuFma<T extends AnyFloatVecInstance | number>(e1: T, e2: T, e3: T): T {
  if (typeof e1 === 'number') {
    return (e1 * (e2 as number) + (e3 as number)) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for fma on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const fma = dualImpl({
  name: 'fma',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuFma,
  codegenImpl: (_ctx, [e1, e2, e3]) => stitch`fma(${e1}, ${e2}, ${e3})`,
});

function cpuFract(value: number): number;
function cpuFract<T extends AnyFloatVecInstance>(value: T): T;
function cpuFract<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return (value - Math.floor(value)) as T;
  }
  return VectorOps.fract[value.kind](value) as T;
}

export const fract = dualImpl({
  name: 'fract',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuFract,
  codegenImpl: (_ctx, [a]) => stitch`fract(${a})`,
});

const FrexpResults = {
  f32: abstruct({ fract: f32, exp: i32 }),
  f16: abstruct({ fract: f16, exp: i32 }),
  abstractFloat: abstruct({ fract: abstractFloat, exp: abstractInt }),
  vec2f: abstruct({ fract: vec2f, exp: vec2i }),
  vec3f: abstruct({ fract: vec3f, exp: vec3i }),
  vec4f: abstruct({ fract: vec4f, exp: vec4i }),
  vec2h: abstruct({ fract: vec2h, exp: vec2i }),
  vec3h: abstruct({ fract: vec3h, exp: vec3i }),
  vec4h: abstruct({ fract: vec4h, exp: vec4i }),
} as const;

type FrexpOverload = {
  (value: number): Infer<(typeof FrexpResults)['f32']>;
  <T extends AnyFloatVecInstance>(value: T): Infer<(typeof FrexpResults)[T['kind']]>;
};

export const frexp = dualImpl<FrexpOverload>({
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

export const insertBits = dualImpl<typeof cpuInsertBits>({
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
});

function cpuInverseSqrt(value: number): number;
function cpuInverseSqrt<T extends AnyFloatVecInstance>(value: T): T;
function cpuInverseSqrt<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return (1 / Math.sqrt(value)) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for inverseSqrt on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const inverseSqrt = dualImpl({
  name: 'inverseSqrt',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuInverseSqrt,
  codegenImpl: (_ctx, [value]) => stitch`inverseSqrt(${value})`,
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

export const ldexp = dualImpl<typeof cpuLdexp>({
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
});

function cpuLength(value: number): number;
function cpuLength<T extends AnyFloatVecInstance>(value: T): number;
function cpuLength<T extends AnyFloatVecInstance | number>(value: T): number {
  if (typeof value === 'number') {
    return Math.abs(value);
  }
  return VectorOps.length[value.kind](value);
}

export const length = dualImpl({
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
});

function cpuLog(value: number): number;
function cpuLog<T extends AnyFloatVecInstance>(value: T): T;
function cpuLog<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.log(value) as T;
  }
  return VectorOps.log[value.kind](value) as T;
}

export const log = dualImpl({
  name: 'log',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuLog,
  codegenImpl: (_ctx, [value]) => stitch`log(${value})`,
});

function cpuLog2(value: number): number;
function cpuLog2<T extends AnyFloatVecInstance>(value: T): T;
function cpuLog2<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.log2(value) as T;
  }
  return VectorOps.log2[value.kind](value) as T;
}

export const log2 = dualImpl({
  name: 'log2',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuLog2,
  codegenImpl: (_ctx, [value]) => stitch`log2(${value})`,
});

function cpuMax(a: number, b: number): number;
function cpuMax<T extends NumVec>(a: T, b: T): T;
function cpuMax<T extends NumVec | number>(a: T, b: T): T {
  if (typeof a === 'number') {
    return Math.max(a, b as number) as T;
  }
  return VectorOps.max[a.kind](a, b as NumVec) as T;
}

type VariadicOverload = {
  (fst: number, ...rest: number[]): number;
  <T extends NumVec>(fst: T, ...rest: T[]): T;
};

export const max = dualImpl({
  name: 'max',
  signature: variadicUnifySignature,
  normalImpl: variadicReduce(cpuMax) as VariadicOverload,
  codegenImpl: variadicStitch('max'),
});

function cpuMin(a: number, b: number): number;
function cpuMin<T extends NumVec>(a: T, b: T): T;
function cpuMin<T extends NumVec | number>(a: T, b: T): T {
  if (typeof a === 'number') {
    return Math.min(a, b as number) as T;
  }
  return VectorOps.min[a.kind](a, b as NumVec) as T;
}

export const min = dualImpl({
  name: 'min',
  signature: variadicUnifySignature,
  normalImpl: variadicReduce(cpuMin) as VariadicOverload,
  codegenImpl: variadicStitch('min'),
});

function cpuMix(e1: number, e2: number, e3: number): number;
function cpuMix<T extends AnyFloatVecInstance>(e1: T, e2: T, e3: number): T;
function cpuMix<T extends AnyFloatVecInstance>(e1: T, e2: T, e3: T): T;
function cpuMix<T extends AnyFloatVecInstance | number>(e1: T, e2: T, e3: T): T {
  if (typeof e1 === 'number') {
    if (typeof e3 !== 'number' || typeof e2 !== 'number') {
      throw new Error('When e1 and e2 are numbers, the blend factor must be a number.');
    }
    return (e1 * (1 - e3) + e2 * e3) as T;
  }

  if (typeof e1 === 'number' || typeof e2 === 'number') {
    throw new Error('e1 and e2 need to both be vectors of the same kind.');
  }

  return VectorOps.mix[e1.kind](e1, e2, e3) as T;
}

export const mix = dualImpl({
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
});

const ModfResult = {
  f32: abstruct({ fract: f32, whole: f32 }),
  f16: abstruct({ fract: f16, whole: f16 }),
  abstractFloat: abstruct({ fract: abstractFloat, whole: abstractFloat }),
  vec2f: abstruct({ fract: vec2f, whole: vec2f }),
  vec3f: abstruct({ fract: vec3f, whole: vec3f }),
  vec4f: abstruct({ fract: vec4f, whole: vec4f }),
  vec2h: abstruct({ fract: vec2h, whole: vec2h }),
  vec3h: abstruct({ fract: vec3h, whole: vec3h }),
  vec4h: abstruct({ fract: vec4h, whole: vec4h }),
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

export const modf: ModfOverload = dualImpl<typeof cpuModf>({
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
});

export const normalize = dualImpl({
  name: 'normalize',
  signature: unifyRestrictedSignature(anyFloatVec),
  normalImpl: <T extends AnyFloatVecInstance>(v: T): T => VectorOps.normalize[v.kind](v),
  codegenImpl: (_ctx, [value]) => stitch`normalize(${value})`,
});

function powCpu(base: number, exponent: number): number;
function powCpu<T extends AnyFloatVecInstance>(base: T, exponent: T): T;
function powCpu<T extends AnyFloatVecInstance | number>(base: T, exponent: T): T {
  if (typeof base === 'number' && typeof exponent === 'number') {
    return (base ** exponent) as T;
  }
  if (isVecInstance(base) && isVecInstance(exponent)) {
    return VectorOps.pow[base.kind](base, exponent) as T;
  }
  throw new Error(`Invalid arguments to pow(): '${base}' '${exponent}'`);
}

export const pow = dualImpl({
  name: 'pow',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: powCpu,
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`pow(${lhs}, ${rhs})`,
});
function cpuQuantizeToF16(value: number): number;
function cpuQuantizeToF16<T extends AnyFloat32VecInstance>(value: T): T;
function cpuQuantizeToF16<T extends AnyFloat32VecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const quantizeToF16 = dualImpl<typeof cpuQuantizeToF16>({
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
});

function cpuRadians(value: number): number;
function cpuRadians<T extends AnyFloatVecInstance | number>(value: T): T;
function cpuRadians<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return ((value * Math.PI) / 180) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for radians on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const radians = dualImpl({
  name: 'radians',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuRadians,
  codegenImpl: (_ctx, [value]) => stitch`radians(${value})`,
});

export const reflect = dualImpl({
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
  normalImpl: <T extends AnyFloatVecInstance>(e1: T, e2: T): T => sub(e1, mul(2 * dot(e2, e1), e2)),
  codegenImpl: (_ctx, [e1, e2]) => stitch`reflect(${e1}, ${e2})`,
});

export const refract = dualImpl<<T extends AnyFloatVecInstance>(e1: T, e2: T, e3: number) => T>({
  name: 'refract',
  normalImpl:
    'CPU implementation for refract not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [e1, e2, e3]) => stitch`refract(${e1}, ${e2}, ${e3})`,
  signature: (e1, e2, _e3) => ({
    argTypes: [e1, e2, isHalfPrecisionSchema(e1) ? f16 : f32],
    returnType: e1,
  }),
});
function cpuReverseBits(value: number): number;
function cpuReverseBits<T extends AnyIntegerVecInstance>(value: T): T;
function cpuReverseBits<T extends AnyIntegerVecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const reverseBits = dualImpl<typeof cpuReverseBits>({
  name: 'reverseBits',
  signature: unifyRestrictedSignature(anyConcreteInteger),
  normalImpl:
    'CPU implementation for reverseBits not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`reverseBits(${value})`,
});

function cpuRound(value: number): number;
function cpuRound<T extends AnyFloatVecInstance>(value: T): T;
function cpuRound<T extends AnyFloatVecInstance | number>(value: T): T {
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

export const round = dualImpl({
  name: 'round',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuRound,
  codegenImpl: (_ctx, [value]) => stitch`round(${value})`,
});

function cpuSaturate(value: number): number;
function cpuSaturate<T extends AnyFloatVecInstance>(value: T): T;
function cpuSaturate<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.max(0, Math.min(1, value)) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for saturate on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const saturate = dualImpl({
  name: 'saturate',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuSaturate,
  codegenImpl: (_ctx, [value]) => stitch`saturate(${value})`,
});

function cpuSign(e: number): number;
function cpuSign<T extends AnySignedVecInstance>(e: T): T;
function cpuSign<T extends AnySignedVecInstance | number>(e: T): T {
  if (typeof e === 'number') {
    return Math.sign(e) as T;
  }
  return VectorOps.sign[e.kind](e) as T;
}

export const sign = dualImpl({
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
});

function cpuSin(value: number): number;
function cpuSin<T extends AnyFloatVecInstance>(value: T): T;
function cpuSin<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.sin(value) as T;
  }
  return VectorOps.sin[value.kind](value) as T;
}

export const sin = dualImpl({
  name: 'sin',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuSin,
  codegenImpl: (_ctx, [value]) => stitch`sin(${value})`,
});

function cpuSinh(value: number): number;
function cpuSinh<T extends AnyFloatVecInstance>(value: T): T;
function cpuSinh<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.sinh(value) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for sinh on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const sinh = dualImpl({
  name: 'sinh',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuSinh,
  codegenImpl: (_ctx, [value]) => stitch`sinh(${value})`,
});

function cpuSmoothstep(edge0: number, edge1: number, x: number): number;
function cpuSmoothstep<T extends AnyFloatVecInstance>(edge0: T, edge1: T, x: T): T;
function cpuSmoothstep<T extends AnyFloatVecInstance | number>(edge0: T, edge1: T, x: T): T {
  if (typeof x === 'number') {
    return smoothstepScalar(edge0 as number, edge1 as number, x) as T;
  }
  return VectorOps.smoothstep[x.kind](
    edge0 as AnyFloatVecInstance,
    edge1 as AnyFloatVecInstance,
    x,
  ) as T;
}

export const smoothstep = dualImpl({
  name: 'smoothstep',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuSmoothstep,
  codegenImpl: (_ctx, [edge0, edge1, x]) => stitch`smoothstep(${edge0}, ${edge1}, ${x})`,
});

function cpuSqrt(value: number): number;
function cpuSqrt<T extends AnyFloatVecInstance>(value: T): T;
function cpuSqrt<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.sqrt(value) as T;
  }
  return VectorOps.sqrt[value.kind](value) as T;
}

export const sqrt = dualImpl({
  name: 'sqrt',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuSqrt,
  codegenImpl: (_ctx, [value]) => stitch`sqrt(${value})`,
});

function cpuStep(edge: number, x: number): number;
function cpuStep<T extends AnyFloatVecInstance | number>(edge: T, x: T): T;
function cpuStep<T extends AnyFloatVecInstance | number>(edge: T, x: T): T {
  if (typeof edge === 'number') {
    return (edge <= (x as number) ? 1.0 : 0.0) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for step on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const step = dualImpl({
  name: 'step',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuStep,
  codegenImpl: (_ctx, [edge, x]) => stitch`step(${edge}, ${x})`,
});

function cpuTan(value: number): number;
function cpuTan<T extends AnyFloatVecInstance>(value: T): T;
function cpuTan<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.tan(value) as T;
  }
  throw new MissingCpuImplError(
    'CPU implementation for tan on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  );
}

export const tan = dualImpl({
  name: 'tan',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuTan,
  codegenImpl: (_ctx, [value]) => stitch`tan(${value})`,
});

function cpuTanh(value: number): number;
function cpuTanh<T extends AnyFloatVecInstance>(value: T): T;
function cpuTanh<T extends AnyFloatVecInstance | number>(value: T): T {
  if (typeof value === 'number') {
    return Math.tanh(value) as T;
  }
  return VectorOps.tanh[value.kind](value) as T;
}

export const tanh = dualImpl({
  name: 'tanh',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl: cpuTanh,
  codegenImpl: (_ctx, [value]) => stitch`tanh(${value})`,
});

export const transpose = dualImpl<<T extends AnyMatInstance>(e: T) => T>({
  name: 'transpose',
  signature: unaryIdentitySignature,
  normalImpl:
    'CPU implementation for transpose not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [e]) => stitch`transpose(${e})`,
});

function cpuTrunc(value: number): number;
function cpuTrunc<T extends AnyFloatVecInstance>(value: T): T;
function cpuTrunc<T extends AnyFloatVecInstance | number>(_value: T): T {
  throw new Error('Unreachable code. The function is only used for the type.');
}

export const trunc = dualImpl<typeof cpuTrunc>({
  name: 'trunc',
  signature: unifyRestrictedSignature(anyFloat),
  normalImpl:
    'CPU implementation for trunc not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
  codegenImpl: (_ctx, [value]) => stitch`trunc(${value})`,
});
