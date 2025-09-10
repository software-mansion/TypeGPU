import { createDualImpl, dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { smoothstepScalar } from '../data/numberOps.ts';
import {
  abstractFloat,
  abstractInt,
  f16,
  f32,
  i32,
  u32,
} from '../data/numeric.ts';
import { snip } from '../data/snippet.ts';
import { abstruct } from '../data/struct.ts';
import {
  vec2f,
  vec2h,
  vec2i,
  vec3f,
  vec3h,
  vec3i,
  vec4f,
  vec4h,
  vec4i,
} from '../data/vector.ts';
import { VectorOps } from '../data/vectorOps.ts';
import {
  type AnyFloat32VecInstance,
  type AnyFloatVecInstance,
  type AnyIntegerVecInstance,
  type AnyMatInstance,
  type AnyNumericVecInstance,
  type AnySignedVecInstance,
  type AnyWgslData,
  isNumericSchema,
  isVecInstance,
  type v2i,
  type v3f,
  type v3h,
  type v3i,
  type v4i,
} from '../data/wgslTypes.ts';
import type { Infer } from '../shared/repr.ts';
import { unify } from '../tgsl/conversion.ts';
import { mul, sub } from './operators.ts';

type NumVec = AnyNumericVecInstance;

export const abs = dualImpl({
  name: 'abs',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends NumVec | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.abs(value) as T;
    }
    return VectorOps.abs[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`abs(${value})`,
});

export const acos = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.acos(value) as T;
    }
    return VectorOps.acos[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`acos(${value})`,
  name: 'acos',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#acosh-builtin
 */
export const acosh = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.acosh(value) as T;
    }
    return VectorOps.acosh[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`acosh(${value})`,
  name: 'acosh',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#asin-builtin
 */
export const asin = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.asin(value) as T;
    }
    return VectorOps.asin[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`asin(${value})`,
  name: 'asin',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#asinh-builtin
 */
export const asinh = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.asinh(value) as T;
    }
    return VectorOps.asinh[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`asinh(${value})`,
  name: 'asinh',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#atan-builtin
 */
export const atan = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.atan(value) as T;
    }
    return VectorOps.atan[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`atan(${value})`,
  name: 'atan',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#atanh-builtin
 */
export const atanh = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.atanh(value) as T;
    }
    return VectorOps.atanh[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`atanh(${value})`,
  name: 'atanh',
});

export const atan2 = dualImpl({
  signature: (...args) => {
    const uargs = unify(args, [f32, f16, abstractFloat]) ?? args;
    return ({
      argTypes: uargs,
      returnType: uargs[0],
    });
  },
  normalImpl: <T extends AnyFloatVecInstance | number>(y: T, x: T): T => {
    if (typeof y === 'number' && typeof x === 'number') {
      return Math.atan2(y, x) as T;
    }
    return VectorOps.atan2[(y as AnyFloatVecInstance).kind](
      y as never,
      x as never,
    ) as T;
  },
  codegenImpl: (y, x) => stitch`atan2(${y}, ${x})`,
  name: 'atan2',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#ceil-builtin
 */
export const ceil = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.ceil(value) as T;
    }
    return VectorOps.ceil[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`ceil(${value})`,
  name: 'ceil',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#clamp
 */
export const clamp = dualImpl({
  signature: (value, low, high) => ({
    argTypes: [value, low, high],
    returnType: value,
  }),
  normalImpl: <T extends NumVec | number>(value: T, low: T, high: T): T => {
    if (typeof value === 'number') {
      return Math.min(Math.max(low as number, value), high as number) as T;
    }
    return VectorOps.clamp[value.kind](
      value,
      low as NumVec,
      high as NumVec,
    ) as T;
  },
  codegenImpl: (value, low, high) => stitch`clamp(${value}, ${low}, ${high})`,
  name: 'clamp',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#cos-builtin
 */
export const cos = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.cos(value) as T;
    }
    return VectorOps.cos[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`cos(${value})`,
  name: 'cos',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#cosh-builtin
 */
export const cosh = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.cosh(value) as T;
    }
    return VectorOps.cosh[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`cosh(${value})`,
  name: 'cosh',
});

export const countLeadingZeros = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyIntegerVecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for countLeadingZeros not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`countLeadingZeros(${value})`,
  name: 'countLeadingZeros',
});

export const countOneBits = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyIntegerVecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for countOneBits not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`countOneBits(${value})`,
  name: 'countOneBits',
});

export const countTrailingZeros = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyIntegerVecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for countTrailingZeros not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`countTrailingZeros(${value})`,
  name: 'countTrailingZeros',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#cross-builtin
 */
export const cross = dualImpl({
  signature: (lhs, rhs) => ({ argTypes: [lhs, rhs], returnType: lhs }),
  normalImpl: <T extends v3f | v3h>(a: T, b: T): T =>
    VectorOps.cross[a.kind](a, b),
  codegenImpl: (a, b) => stitch`cross(${a}, ${b})`,
  name: 'cross',
});

export const degrees = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return ((value * 180) / Math.PI) as T;
    }
    throw new Error(
      'CPU implementation for degrees on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`degrees(${value})`,
  name: 'degrees',
});

export const determinant = dualImpl({
  // TODO: The return type is potentially wrong here, it should return whatever the matrix element type is.
  signature: (arg) => ({ argTypes: [arg], returnType: f32 }),
  normalImpl: (value: AnyMatInstance): number => {
    throw new Error(
      'CPU implementation for determinant not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`determinant(${value})`,
  name: 'determinant',
});

export const distance = dualImpl({
  signature: (lhs, rhs) => ({
    argTypes: [lhs, rhs],
    returnType: lhs.type === 'f16' || rhs.type.endsWith('h') ? f16 : f32,
  }),
  normalImpl: <T extends AnyFloatVecInstance | number>(a: T, b: T): number => {
    if (typeof a === 'number' && typeof b === 'number') {
      return Math.abs(a - b);
    }
    return length(
      sub(a as AnyFloatVecInstance, b as AnyFloatVecInstance),
    ) as number;
  },
  codegenImpl: (a, b) => stitch`distance(${a}, ${b})`,
  name: 'distance',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#dot-builtin
 */
export const dot = dualImpl({
  name: 'dot',
  signature: (...argTypes) => ({ argTypes, returnType: f32 }),
  normalImpl: <T extends NumVec>(lhs: T, rhs: T): number =>
    VectorOps.dot[lhs.kind](lhs, rhs),
  codegenImpl: (lhs, rhs) => stitch`dot(${lhs}, ${rhs})`,
});

export const dot4U8Packed = dualImpl({
  signature: (lhs, rhs) => ({ argTypes: [u32, u32], returnType: u32 }),
  normalImpl: (e1: number, e2: number): number => {
    throw new Error(
      'CPU implementation for dot4U8Packed not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (e1, e2) => stitch`dot4U8Packed(${e1}, ${e2})`,
  name: 'dot4U8Packed',
});

export const dot4I8Packed = dualImpl({
  signature: (lhs, rhs) => ({ argTypes: [u32, u32], returnType: i32 }),
  normalImpl: (e1: number, e2: number): number => {
    throw new Error(
      'CPU implementation for dot4I8Packed not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (e1, e2) => stitch`dot4I8Packed(${e1}, ${e2})`,
  name: 'dot4I8Packed',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#exp-builtin
 */
export const exp = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.exp(value) as T;
    }
    return VectorOps.exp[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`exp(${value})`,
  name: 'exp',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#exp2-builtin
 */
export const exp2 = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return (2 ** value) as T;
    }
    return VectorOps.exp2[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`exp2(${value})`,
  name: 'exp2',
});

export const extractBits = dualImpl({
  signature: (arg, offset, count) => ({
    argTypes: [arg, u32, u32],
    returnType: arg,
  }),
  normalImpl: <T extends AnyIntegerVecInstance | number>(
    e: T,
    offset: number,
    count: number,
  ): T => {
    throw new Error(
      'CPU implementation for extractBits not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (e, offset, count) =>
    stitch`extractBits(${e}, ${offset}, ${count})`,
  name: 'extractBits',
});

export const faceForward = dualImpl({
  signature: (arg1, arg2, arg3) => ({
    argTypes: [arg1, arg2, arg3],
    returnType: arg1,
  }),
  normalImpl: <T extends AnyFloatVecInstance>(e1: T, e2: T, e3: T): T => {
    throw new Error(
      'CPU implementation for faceForward not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (e1, e2, e3) => stitch`faceForward(${e1}, ${e2}, ${e3})`,
  name: 'faceForward',
});

export const firstLeadingBit = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyIntegerVecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for firstLeadingBit not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`firstLeadingBit(${value})`,
  name: 'firstLeadingBit',
});

export const firstTrailingBit = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyIntegerVecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for firstTrailingBit not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`firstTrailingBit(${value})`,
  name: 'firstTrailingBit',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#floor-builtin
 */
export const floor = dualImpl({
  name: 'floor',
  signature: (...argTypes) => ({ argTypes, returnType: argTypes[0] }),
  normalImpl<T extends AnyFloatVecInstance | number>(value: T): T {
    if (typeof value === 'number') {
      return Math.floor(value) as T;
    }
    return VectorOps.floor[value.kind](value) as T;
  },
  codegenImpl: (arg) => stitch`floor(${arg})`,
});

export const fma = dualImpl({
  signature: (arg1, arg2, arg3) => ({
    argTypes: [arg1, arg2, arg3],
    returnType: arg1,
  }),
  normalImpl: <T extends AnyFloatVecInstance | number>(
    e1: T,
    e2: T,
    e3: T,
  ): T => {
    if (typeof e1 === 'number') {
      return (e1 * (e2 as number) + (e3 as number)) as T;
    }
    throw new Error(
      'CPU implementation for fma on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (e1, e2, e3) => stitch`fma(${e1}, ${e2}, ${e3})`,
  name: 'fma',
});

export const fract = dualImpl({
  name: 'fract',
  signature: (...argTypes) => ({ argTypes, returnType: argTypes[0] }),
  normalImpl<T extends AnyFloatVecInstance | number>(a: T): T {
    if (typeof a === 'number') {
      return (a - Math.floor(a)) as T;
    }
    return VectorOps.fract[a.kind](a) as T;
  },
  codegenImpl: (a) => stitch`fract(${a})`,
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
  (value: number): Infer<typeof FrexpResults['f32']>;
  <T extends AnyFloatVecInstance>(
    value: T,
  ): Infer<typeof FrexpResults[T['kind']]>;
};

export const frexp: FrexpOverload = createDualImpl(
  // CPU implementation
  (value: number): {
    fract: number;
    exp: number;
  } => {
    throw new Error(
      'CPU implementation for frexp not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => {
    const returnType =
      FrexpResults[value.dataType.type as keyof typeof FrexpResults];

    if (!returnType) {
      throw new Error(
        `Unsupported data type for frexp: ${value.dataType.type}. Supported types are f32, f16, abstractFloat, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h.`,
      );
    }

    return snip(stitch`frexp(${value})`, returnType);
  },
  'frexp',
);

export const insertBits = dualImpl({
  signature: (e, newbits, offset, count) => ({
    argTypes: [e, newbits, u32, u32],
    returnType: e,
  }),
  normalImpl: <T extends AnyIntegerVecInstance | number>(
    e: T,
    newbits: T,
    offset: number,
    count: number,
  ): T => {
    throw new Error(
      'CPU implementation for insertBits not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (e, newbits, offset, count) =>
    stitch`insertBits(${e}, ${newbits}, ${offset}, ${count})`,
  name: 'insertBits',
});

export const inverseSqrt = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return (1 / Math.sqrt(value)) as T;
    }
    throw new Error(
      'CPU implementation for inverseSqrt on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`inverseSqrt(${value})`,
  name: 'inverseSqrt',
});

type FloatVecInstanceToIntVecInstance<T extends AnyFloatVecInstance> = {
  'vec2f': v2i;
  'vec3f': v3i;
  'vec4f': v4i;
  'vec2h': v2i;
  'vec3h': v3i;
  'vec4h': v4i;
}[T['kind']];

type LdexpOverload = {
  (e1: number, e2: number): number;
  <T extends AnyFloatVecInstance>(
    e1: T,
    e2: FloatVecInstanceToIntVecInstance<T>,
  ): T;
};

export const ldexp: LdexpOverload = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(
    e1: T,
    e2: AnyIntegerVecInstance | number,
  ): T => {
    throw new Error(
      'CPU implementation for ldexp not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (e1, e2) => snip(stitch`ldexp(${e1}, ${e2})`, e1.dataType),
  'ldexp',
  (e1, _) => {
    switch (e1.dataType.type) {
      case 'abstractFloat':
        return [abstractFloat, abstractInt];
      case 'f32':
      case 'f16':
        return [e1.dataType, i32];
      case 'vec2f':
      case 'vec2h':
        return [e1.dataType, vec2i];
      case 'vec3f':
      case 'vec3h':
        return [e1.dataType, vec3i];
      case 'vec4f':
      case 'vec4h':
        return [e1.dataType, vec4i];
      default:
        throw new Error(
          `Unsupported data type for ldexp: ${e1.dataType.type}. Supported types are abstractFloat, f32, f16, vec2f, vec2h, vec3f, vec3h, vec4f, vec4h.`,
        );
    }
  },
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#length-builtin
 */
export const length = dualImpl({
  name: 'length',
  signature: (arg) => ({
    argTypes: [arg],
    returnType: arg.type === 'f16' || arg.type.endsWith('h') ? f16 : f32,
  }),
  normalImpl<T extends AnyFloatVecInstance | number>(arg: T): number {
    if (typeof arg === 'number') {
      return Math.abs(arg);
    }
    return VectorOps.length[arg.kind](arg);
  },
  codegenImpl: (arg) => stitch`length(${arg})`,
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#log-builtin
 */
export const log = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.log(value) as T;
    }
    return VectorOps.log[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`log(${value})`,
  name: 'log',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#log2-builtin
 */
export const log2 = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.log2(value) as T;
    }
    return VectorOps.log2[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`log2(${value})`,
  name: 'log2',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#max-float-builtin
 */
export const max = dualImpl({
  signature: (...args) => {
    const uargs = unify(args) ?? args;
    return ({
      argTypes: uargs,
      returnType: uargs[0],
    });
  },
  normalImpl: <T extends NumVec | number>(a: T, b: T): T => {
    if (typeof a === 'number') {
      return Math.max(a, b as number) as T;
    }
    return VectorOps.max[a.kind](a, b as NumVec) as T;
  },
  codegenImpl: (a, b) => stitch`max(${a}, ${b})`,
  name: 'max',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#min-float-builtin
 */
export const min = dualImpl({
  signature: (...args) => {
    const uargs = unify(args) ?? args;
    return ({
      argTypes: uargs,
      returnType: uargs[0],
    });
  },
  normalImpl: <T extends NumVec | number>(a: T, b: T): T => {
    if (typeof a === 'number') {
      return Math.min(a, b as number) as T;
    }
    return VectorOps.min[a.kind](a, b as NumVec) as T;
  },
  codegenImpl: (a, b) => stitch`min(${a}, ${b})`,
  name: 'min',
});

type MixOverload = {
  (e1: number, e2: number, e3: number): number;
  <T extends AnyFloatVecInstance>(e1: T, e2: T, e3: number): T;
  <T extends AnyFloatVecInstance>(e1: T, e2: T, e3: T): T;
};

export const mix: MixOverload = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(e1: T, e2: T, e3: T | number): T => {
    if (typeof e1 === 'number') {
      if (typeof e3 !== 'number' || typeof e2 !== 'number') {
        throw new Error(
          'When e1 and e2 are numbers, the blend factor must be a number.',
        );
      }
      return (e1 * (1 - e3) + e2 * e3) as T;
    }

    if (typeof e1 === 'number' || typeof e2 === 'number') {
      throw new Error('e1 and e2 need to both be vectors of the same kind.');
    }

    return VectorOps.mix[e1.kind](e1, e2, e3) as T;
  },
  // GPU implementation
  (e1, e2, e3) => snip(stitch`mix(${e1}, ${e2}, ${e3})`, e1.dataType),
  'mix',
);

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
  (value: number): Infer<typeof ModfResult['f32']>;
  <T extends AnyFloatVecInstance>(
    value: T,
  ): Infer<typeof ModfResult[T['kind']]>;
};

export const modf: ModfOverload = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T) => {
    throw new Error(
      'CPU implementation for modf not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => {
    const returnType =
      ModfResult[value.dataType.type as keyof typeof ModfResult];

    if (!returnType) {
      throw new Error(
        `Unsupported data type for modf: ${value.dataType.type}. Supported types are f32, f16, abstractFloat, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h.`,
      );
    }

    return snip(stitch`modf(${value})`, returnType);
  },
  'modf',
);

export const normalize = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance>(v: T): T =>
    VectorOps.normalize[v.kind](v),
  codegenImpl: (v) => stitch`normalize(${v})`,
  name: 'normalize',
});

function powCpu(base: number, exponent: number): number;
function powCpu<T extends AnyFloatVecInstance>(
  base: T,
  exponent: T,
): T;
function powCpu<T extends AnyFloatVecInstance | number>(
  base: T,
  exponent: T,
): T {
  if (typeof base === 'number' && typeof exponent === 'number') {
    return (base ** exponent) as T;
  }
  if (isVecInstance(base) && isVecInstance(exponent)) {
    return VectorOps.pow[base.kind](base, exponent) as T;
  }
  throw new Error('Invalid arguments to pow()');
}

export const pow = dualImpl({
  name: 'pow',
  signature: (...args) => {
    const uargs = unify(args, [f32, f16, abstractFloat]) ?? args;
    return {
      argTypes: uargs,
      returnType: isNumericSchema(uargs[0]) ? uargs[1] : uargs[0],
    };
  },
  normalImpl: powCpu,
  codegenImpl: (lhs, rhs) => stitch`pow(${lhs}, ${rhs})`,
});

export const quantizeToF16 = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for quantizeToF16 not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`quantizeToF16(${value})`,
  name: 'quantizeToF16',
});

export const radians = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return ((value * Math.PI) / 180) as T;
    }
    throw new Error(
      'CPU implementation for radians on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`radians(${value})`,
  name: 'radians',
});

export const reflect = dualImpl({
  signature: (lhs, rhs) => ({ argTypes: [lhs, rhs], returnType: lhs }),
  normalImpl: <T extends AnyFloatVecInstance>(e1: T, e2: T): T =>
    sub(e1, mul(2 * dot(e2, e1), e2)),
  codegenImpl: (e1, e2) => stitch`reflect(${e1}, ${e2})`,
  name: 'reflect',
});

export const refract = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance>(e1: T, e2: T, e3: number): T => {
    throw new Error(
      'CPU implementation for refract not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (e1, e2, e3) => snip(stitch`refract(${e1}, ${e2}, ${e3})`, e1.dataType),
  'refract',
  (e1, e2, e3) => [
    e1.dataType as AnyWgslData,
    e2.dataType as AnyWgslData,
    e1.dataType.type === 'f16' || e1.dataType.type.endsWith('h') ? f16 : f32,
  ],
);

export const reverseBits = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyIntegerVecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for reverseBits not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`reverseBits(${value})`,
  name: 'reverseBits',
});

export const round = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.round(value) as T;
    }
    throw new Error(
      'CPU implementation for round on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`round(${value})`,
  name: 'round',
});

export const saturate = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.max(0, Math.min(1, value)) as T;
    }
    throw new Error(
      'CPU implementation for saturate on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`saturate(${value})`,
  name: 'saturate',
});

export const sign = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnySignedVecInstance | number>(e: T): T => {
    if (typeof e === 'number') {
      return Math.sign(e) as T;
    }
    return VectorOps.sign[e.kind](e) as T;
  },
  codegenImpl: (e) => stitch`sign(${e})`,
  name: 'sign',
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#sin-builtin
 */
export const sin = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.sin(value) as T;
    }
    return VectorOps.sin[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`sin(${value})`,
  name: 'sin',
});

export const sinh = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.sinh(value) as T;
    }
    throw new Error(
      'CPU implementation for sinh on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`sinh(${value})`,
  name: 'sinh',
});

export const smoothstep = dualImpl({
  signature: (edge0, edge1, x) => ({
    argTypes: [edge0, edge1, x],
    returnType: x,
  }),
  normalImpl: <T extends AnyFloatVecInstance | number>(
    edge0: T,
    edge1: T,
    x: T,
  ): T => {
    if (typeof x === 'number') {
      return smoothstepScalar(
        edge0 as number,
        edge1 as number,
        x as number,
      ) as T;
    }
    return VectorOps.smoothstep[x.kind](
      edge0 as AnyFloatVecInstance,
      edge1 as AnyFloatVecInstance,
      x as AnyFloatVecInstance,
    ) as T;
  },
  codegenImpl: (edge0, edge1, x) =>
    stitch`smoothstep(${edge0}, ${edge1}, ${x})`,
  name: 'smoothstep',
});

export const sqrt = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.sqrt(value) as T;
    }
    return VectorOps.sqrt[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`sqrt(${value})`,
  name: 'sqrt',
});

export const step = dualImpl({
  signature: (edge, x) => ({ argTypes: [edge, x], returnType: edge }),
  normalImpl: <T extends AnyFloatVecInstance | number>(edge: T, x: T): T => {
    if (typeof edge === 'number') {
      return (edge <= (x as number) ? 1.0 : 0.0) as T;
    }
    throw new Error(
      'CPU implementation for step on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (edge, x) => stitch`step(${edge}, ${x})`,
  name: 'step',
});

export const tan = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.tan(value) as T;
    }
    throw new Error(
      'CPU implementation for tan on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`tan(${value})`,
  name: 'tan',
});

export const tanh = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.tanh(value) as T;
    }
    return VectorOps.tanh[value.kind](value) as T;
  },
  codegenImpl: (value) => stitch`tanh(${value})`,
  name: 'tanh',
});

export const transpose = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: (e: AnyMatInstance) => {
    throw new Error(
      'CPU implementation for transpose not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (e) => stitch`transpose(${e})`,
  name: 'transpose',
});

export const trunc = dualImpl({
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: <T extends AnyFloatVecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for trunc not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  codegenImpl: (value) => stitch`trunc(${value})`,
  name: 'trunc',
});
