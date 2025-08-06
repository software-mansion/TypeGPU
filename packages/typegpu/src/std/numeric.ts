import { snip } from '../data/snippet.ts';
import { smoothstepScalar } from '../data/numberOps.ts';
import { f16, f32, i32, u32 } from '../data/numeric.ts';
import { VectorOps } from '../data/vectorOps.ts';
import type {
  AnyFloat32VecInstance,
  AnyFloatVecInstance,
  AnyIntegerVecInstance,
  AnyMatInstance,
  AnyNumericVecInstance,
  AnySignedVecInstance,
  AnyWgslData,
  v3f,
  v3h,
} from '../data/wgslTypes.ts';
import { createDualImpl } from '../core/function/dualImpl.ts';
import { builtinStruct } from '../data/struct.ts';
import { mul, sub } from './operators.ts';

type NumVec = AnyNumericVecInstance;

export const abs = createDualImpl(
  // CPU implementation
  <T extends NumVec | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.abs(value) as T;
    }
    return VectorOps.abs[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`abs(${value.value})`, value.dataType),
  'abs',
);

export const acos = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.acos(value) as T;
    }
    return VectorOps.acos[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`acos(${value.value})`, value.dataType),
  'acos',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#acosh-builtin
 */
export const acosh = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.acosh(value) as T;
    }
    return VectorOps.acosh[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`acosh(${value.value})`, value.dataType),
  'acosh',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#asin-builtin
 */
export const asin = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.asin(value) as T;
    }
    return VectorOps.asin[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`asin(${value.value})`, value.dataType),
  'asin',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#asinh-builtin
 */
export const asinh = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.asinh(value) as T;
    }
    return VectorOps.asinh[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`asinh(${value.value})`, value.dataType),
  'asinh',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#atan-builtin
 */
export const atan = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.atan(value) as T;
    }
    return VectorOps.atan[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`atan(${value.value})`, value.dataType),
  'atan',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#atanh-builtin
 */
export const atanh = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.atanh(value) as T;
    }
    return VectorOps.atanh[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`atanh(${value.value})`, value.dataType),
  'atanh',
);

export const atan2 = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(y: T, x: T): T => {
    if (typeof y === 'number' && typeof x === 'number') {
      return Math.atan2(y, x) as T;
    }
    return VectorOps.atan2[(y as AnyFloatVecInstance).kind](
      y as never,
      x as never,
    ) as T;
  },
  // GPU implementation
  (y, x) => snip(`atan2(${y.value}, ${x.value})`, y.dataType),
  'atan2',
  'unify',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#ceil-builtin
 */
export const ceil = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.ceil(value) as T;
    }
    return VectorOps.ceil[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`ceil(${value.value})`, value.dataType),
  'ceil',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#clamp
 */
export const clamp = createDualImpl(
  // CPU implementation
  <T extends NumVec | number>(value: T, low: T, high: T): T => {
    if (typeof value === 'number') {
      return Math.min(Math.max(low as number, value), high as number) as T;
    }
    return VectorOps.clamp[value.kind](
      value,
      low as NumVec,
      high as NumVec,
    ) as T;
  },
  // GPU implementation
  (value, low, high) =>
    snip(`clamp(${value.value}, ${low.value}, ${high.value})`, value.dataType),
  'clamp',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#cos-builtin
 */
export const cos = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.cos(value) as T;
    }
    return VectorOps.cos[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`cos(${value.value})`, value.dataType),
  'cos',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#cosh-builtin
 */
export const cosh = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.cosh(value) as T;
    }
    return VectorOps.cosh[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`cosh(${value.value})`, value.dataType),
  'cosh',
);

export const countLeadingZeros = createDualImpl(
  // CPU implementation
  <T extends AnyIntegerVecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for countLeadingZeros not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`countLeadingZeros(${value.value})`, value.dataType),
  'countLeadingZeros',
);

export const countOneBits = createDualImpl(
  // CPU implementation
  <T extends AnyIntegerVecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for countOneBits not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`countOneBits(${value.value})`, value.dataType),
  'countOneBits',
);

export const countTrailingZeros = createDualImpl(
  // CPU implementation
  <T extends AnyIntegerVecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for countTrailingZeros not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`countTrailingZeros(${value.value})`, value.dataType),
  'countTrailingZeros',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#cross-builtin
 */
export const cross = createDualImpl(
  // CPU implementation
  <T extends v3f | v3h>(a: T, b: T): T => VectorOps.cross[a.kind](a, b),
  // GPU implementation
  (a, b) => snip(`cross(${a.value}, ${b.value})`, a.dataType),
  'cross',
);

export const degrees = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return ((value * 180) / Math.PI) as T;
    }
    throw new Error(
      'CPU implementation for degrees on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`degrees(${value.value})`, value.dataType),
  'degrees',
);

export const determinant = createDualImpl(
  // CPU implementation
  (value: AnyMatInstance): number => {
    throw new Error(
      'CPU implementation for determinant not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  // TODO: The return type is potentially wrong here, it should return whatever the matrix element type is.
  (value) => snip(`determinant(${value.value})`, f32),
  'determinant',
);

export const distance = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(a: T, b: T): number => {
    if (typeof a === 'number' && typeof b === 'number') {
      return Math.abs(a - b);
    }
    return length(
      sub(a as AnyFloatVecInstance, b as AnyFloatVecInstance),
    ) as number;
  },
  // GPU implementation
  (a, b) =>
    snip(
      `distance(${a.value}, ${b.value})`,
      a.dataType.type === 'f16' || a.dataType.type.endsWith('h') ? f16 : f32,
    ),
  'distance',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#dot-builtin
 */
export const dot = createDualImpl(
  // CPU implementation
  <T extends NumVec>(lhs: T, rhs: T): number =>
    VectorOps.dot[lhs.kind](lhs, rhs),
  // GPU implementation
  (lhs, rhs) => snip(`dot(${lhs.value}, ${rhs.value})`, f32),
  'dot',
);

export const dot4U8Packed = createDualImpl(
  // CPU implementation
  (e1: number, e2: number): number => {
    throw new Error(
      'CPU implementation for dot4U8Packed not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (e1, e2) => snip(`dot4U8Packed(${e1.value}, ${e2.value})`, u32),
  'dot4U8Packed',
  [u32, u32],
);

export const dot4I8Packed = createDualImpl(
  // CPU implementation
  (e1: number, e2: number): number => {
    throw new Error(
      'CPU implementation for dot4I8Packed not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (e1, e2) => snip(`dot4I8Packed(${e1.value}, ${e2.value})`, i32),
  'dot4I8Packed',
  [i32, i32],
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#exp-builtin
 */
export const exp = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.exp(value) as T;
    }
    return VectorOps.exp[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`exp(${value.value})`, value.dataType),
  'exp',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#exp2-builtin
 */
export const exp2 = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return (2 ** value) as T;
    }
    return VectorOps.exp2[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`exp2(${value.value})`, value.dataType),
  'exp2',
);

export const extractBits = createDualImpl(
  // CPU implementation
  <T extends AnyIntegerVecInstance | number>(
    e: T,
    offset: number,
    count: number,
  ): T => {
    throw new Error(
      'CPU implementation for extractBits not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (e, offset, count) =>
    snip(
      `extractBits(${e.value}, ${offset.value}, ${count.value})`,
      e.dataType,
    ),
  'extractBits',
  (e, offset, count) => [e.dataType as AnyWgslData, u32, u32],
);

export const faceForward = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance>(e1: T, e2: T, e3: T): T => {
    throw new Error(
      'CPU implementation for faceForward not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (e1, e2, e3) =>
    snip(`faceForward(${e1.value}, ${e2.value}, ${e3.value})`, e1.dataType),
  'faceForward',
);

export const firstLeadingBit = createDualImpl(
  // CPU implementation
  <T extends AnyIntegerVecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for firstLeadingBit not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`firstLeadingBit(${value.value})`, value.dataType),
  'firstLeadingBit',
);

export const firstTrailingBit = createDualImpl(
  // CPU implementation
  <T extends AnyIntegerVecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for firstTrailingBit not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`firstTrailingBit(${value.value})`, value.dataType),
  'firstTrailingBit',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#floor-builtin
 */
export const floor = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.floor(value) as T;
    }
    return VectorOps.floor[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`floor(${value.value})`, value.dataType),
  'floor',
);

export const fma = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(e1: T, e2: T, e3: T): T => {
    if (typeof e1 === 'number') {
      return (e1 * (e2 as number) + (e3 as number)) as T;
    }
    throw new Error(
      'CPU implementation for fma on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (e1, e2, e3) =>
    snip(`fma(${e1.value}, ${e2.value}, ${e3.value})`, e1.dataType),
  'fma',
);

export const fract = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(a: T): T => {
    if (typeof a === 'number') {
      return (a - Math.floor(a)) as T;
    }
    return VectorOps.fract[a.kind](a) as T;
  },
  // GPU implementation
  (a) => snip(`fract(${a.value})`, a.dataType),
  'fract',
);

const FrexpResultF32 = builtinStruct(
  { fract: f32, exp: i32 },
  '__frexp_result_f32',
);

export const frexp = createDualImpl(
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
  (value) =>
    snip(
      `frexp(${value.value})`,
      FrexpResultF32,
    ),
  'frexp',
  [f32],
);

export const insertBits = createDualImpl(
  // CPU implementation
  <T extends AnyIntegerVecInstance | number>(
    e: T,
    newbits: T,
    offset: number,
    count: number,
  ): T => {
    throw new Error(
      'CPU implementation for insertBits not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (e, newbits, offset, count) =>
    snip(
      `insertBits(${e.value}, ${newbits.value}, ${offset.value}, ${count.value})`,
      e.dataType,
    ),
  'insertBits',
);

export const inverseSqrt = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return (1 / Math.sqrt(value)) as T;
    }
    throw new Error(
      'CPU implementation for inverseSqrt on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`inverseSqrt(${value.value})`, value.dataType),
  'inverseSqrt',
);

export const ldexp = createDualImpl(
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
  (e1, e2) => snip(`ldexp(${e1.value}, ${e2.value})`, e1.dataType),
  'ldexp',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#length-builtin
 */
export const length = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): number => {
    if (typeof value === 'number') {
      return Math.abs(value);
    }
    return VectorOps.length[value.kind](value);
  },
  // GPU implementation
  (value) => snip(`length(${value.value})`, f32),
  'length',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#log-builtin
 */
export const log = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.log(value) as T;
    }
    return VectorOps.log[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`log(${value.value})`, value.dataType),
  'log',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#log2-builtin
 */
export const log2 = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.log2(value) as T;
    }
    return VectorOps.log2[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`log2(${value.value})`, value.dataType),
  'log2',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#max-float-builtin
 */
export const max = createDualImpl(
  // CPU implementation
  <T extends NumVec | number>(a: T, b: T): T => {
    if (typeof a === 'number') {
      return Math.max(a, b as number) as T;
    }
    return VectorOps.max[a.kind](a, b as NumVec) as T;
  },
  // GPU implementation
  (a, b) => snip(`max(${a.value}, ${b.value})`, a.dataType),
  'max',
  'unify',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#min-float-builtin
 */
export const min = createDualImpl(
  // CPU implementation
  <T extends NumVec | number>(a: T, b: T): T => {
    if (typeof a === 'number') {
      return Math.min(a, b as number) as T;
    }
    return VectorOps.min[a.kind](a, b as NumVec) as T;
  },
  // GPU implementation
  (a, b) => snip(`min(${a.value}, ${b.value})`, a.dataType),
  'min',
  'unify',
);

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
  (e1, e2, e3) =>
    snip(`mix(${e1.value}, ${e2.value}, ${e3.value})`, e1.dataType),
  'mix',
);

export const modf = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T) => {
    throw new Error(
      'CPU implementation for modf not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`modf(${value.value})`, value.dataType),
  'modf',
);

export const normalize = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance>(v: T): T => VectorOps.normalize[v.kind](v),
  // GPU implementation
  (v) => snip(`normalize(${v.value})`, v.dataType),
  'normalize',
);

type PowOverload = {
  (base: number, exponent: number): number;
  <T extends AnyFloatVecInstance>(base: T, exponent: T): T;
};

export const pow: PowOverload = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(base: T, exponent: T): T => {
    if (typeof base === 'number' && typeof exponent === 'number') {
      return (base ** exponent) as T;
    }
    if (
      typeof base === 'object' &&
      typeof exponent === 'object' &&
      'kind' in base &&
      'kind' in exponent
    ) {
      return VectorOps.pow[base.kind](base, exponent) as T;
    }
    throw new Error('Invalid arguments to pow()');
  },
  // GPU implementation
  (base, exponent) =>
    snip(`pow(${base.value}, ${exponent.value})`, base.dataType),
  'pow',
);

export const quantizeToF16 = createDualImpl(
  // CPU implementation
  <T extends AnyFloat32VecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for quantizeToF16 not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`quantizeToF16(${value.value})`, value.dataType),
  'quantizeToF16',
);

export const radians = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return ((value * Math.PI) / 180) as T;
    }
    throw new Error(
      'CPU implementation for radians on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`radians(${value.value})`, value.dataType),
  'radians',
);

export const reflect = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance>(e1: T, e2: T): T =>
    sub(e1, mul(2 * dot(e2, e1), e2)),
  // GPU implementation
  (e1, e2) => snip(`reflect(${e1.value}, ${e2.value})`, e1.dataType),
  'reflect',
);

export const refract = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance>(e1: T, e2: T, e3: number): T => {
    throw new Error(
      'CPU implementation for refract not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (e1, e2, e3) =>
    snip(`refract(${e1.value}, ${e2.value}, ${e3.value})`, e1.dataType),
  'refract',
  (e1, e2, e3) => [
    e1.dataType as AnyWgslData,
    e2.dataType as AnyWgslData,
    e1.dataType.type === 'f16' || e1.dataType.type.endsWith('h') ? f16 : f32,
  ],
);

export const reverseBits = createDualImpl(
  // CPU implementation
  <T extends AnyIntegerVecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for reverseBits not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`reverseBits(${value.value})`, value.dataType),
  'reverseBits',
);

export const round = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.round(value) as T;
    }
    throw new Error(
      'CPU implementation for round on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`round(${value.value})`, value.dataType),
  'round',
);

export const saturate = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.max(0, Math.min(1, value)) as T;
    }
    throw new Error(
      'CPU implementation for saturate on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`saturate(${value.value})`, value.dataType),
  'saturate',
);

export const sign = createDualImpl(
  // CPU implementation
  <T extends AnySignedVecInstance | number>(
    e: T,
  ): T => {
    if (typeof e === 'number') {
      return Math.sign(e) as T;
    }
    return VectorOps.sign[e.kind](e) as T;
  },
  // GPU implementation
  (e) => snip(`sign(${e.value})`, e.dataType),
  'sign',
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#sin-builtin
 */
export const sin = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.sin(value) as T;
    }
    return VectorOps.sin[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`sin(${value.value})`, value.dataType),
  'sin',
);

export const sinh = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.sinh(value) as T;
    }
    throw new Error(
      'CPU implementation for sinh on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`sinh(${value.value})`, value.dataType),
  'sinh',
);

export const smoothstep = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(edge0: T, edge1: T, x: T): T => {
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
  // GPU implementation
  (edge0, edge1, x) =>
    snip(`smoothstep(${edge0.value}, ${edge1.value}, ${x.value})`, x.dataType),
  'smoothstep',
);

export const sqrt = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.sqrt(value) as T;
    }
    return VectorOps.sqrt[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`sqrt(${value.value})`, value.dataType),
  'sqrt',
);

export const step = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(edge: T, x: T): T => {
    if (typeof edge === 'number') {
      return (edge <= (x as number) ? 1.0 : 0.0) as T;
    }
    throw new Error(
      'CPU implementation for step on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (edge, x) => snip(`step(${edge.value}, ${x.value})`, edge.dataType),
  'step',
);

export const tan = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.tan(value) as T;
    }
    throw new Error(
      'CPU implementation for tan on vectors not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`tan(${value.value})`, value.dataType),
  'tan',
);

export const tanh = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.tanh(value) as T;
    }
    return VectorOps.tanh[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`tanh(${value.value})`, value.dataType),
  'tanh',
);

export const transpose = createDualImpl(
  // CPU implementation
  (e: AnyMatInstance) => {
    throw new Error(
      'CPU implementation for transpose not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (e) => {
    return snip(`transpose(${e.value})`, e.dataType);
  },
  'transpose',
);

export const trunc = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): T => {
    throw new Error(
      'CPU implementation for trunc not implemented yet. Please submit an issue at https://github.com/software-mansion/TypeGPU/issues',
    );
  },
  // GPU implementation
  (value) => snip(`trunc(${value.value})`, value.dataType),
  'trunc',
);
