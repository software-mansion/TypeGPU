import { snip } from '../data/snippet.ts';
import { smoothstepScalar } from '../data/numberOps.ts';
import {
  abstractFloat,
  abstractInt,
  f16,
  f32,
  i32,
  u32,
} from '../data/numeric.ts';
import { VectorOps } from '../data/vectorOps.ts';
import type {
  AnyFloat32VecInstance,
  AnyFloatVecInstance,
  AnyIntegerVecInstance,
  AnyMatInstance,
  AnyNumericVecInstance,
  AnySignedVecInstance,
  AnyWgslData,
  v2i,
  v3f,
  v3h,
  v3i,
  v4i,
} from '../data/wgslTypes.ts';
import type { Infer } from '../shared/repr.ts';
import { createDualImpl } from '../core/function/dualImpl.ts';
import { abstruct } from '../data/struct.ts';
import { mul, sub } from './operators.ts';
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
  (ctx, value) => snip(`abs(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`acos(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`acosh(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`asin(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`asinh(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`atan(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`atanh(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, y, x) =>
    snip(`atan2(${ctx.resolve(y.value)}, ${ctx.resolve(x.value)})`, y.dataType),
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
  (ctx, value) => snip(`ceil(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value, low, high) =>
    snip(
      `clamp(${ctx.resolve(value.value)}, ${ctx.resolve(low.value)}, ${
        ctx.resolve(high.value)
      })`,
      value.dataType,
    ),
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
  (ctx, value) => snip(`cos(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`cosh(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) =>
    snip(`countLeadingZeros(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) =>
    snip(`countOneBits(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) =>
    snip(`countTrailingZeros(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, a, b) =>
    snip(`cross(${ctx.resolve(a.value)}, ${ctx.resolve(b.value)})`, a.dataType),
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
  (ctx, value) => snip(`degrees(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`determinant(${ctx.resolve(value.value)})`, f32),
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
  (ctx, a, b) =>
    snip(
      `distance(${ctx.resolve(a.value)}, ${ctx.resolve(b.value)})`,
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
  (ctx, lhs, rhs) =>
    snip(`dot(${ctx.resolve(lhs.value)}, ${ctx.resolve(rhs.value)})`, f32),
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
  (ctx, e1, e2) =>
    snip(
      `dot4U8Packed(${ctx.resolve(e1.value)}, ${ctx.resolve(e2.value)})`,
      u32,
    ),
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
  (ctx, e1, e2) =>
    snip(
      `dot4I8Packed(${ctx.resolve(e1.value)}, ${ctx.resolve(e2.value)})`,
      i32,
    ),
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
  (ctx, value) => snip(`exp(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`exp2(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, e, offset, count) =>
    snip(
      `extractBits(${ctx.resolve(e.value)}, ${ctx.resolve(offset.value)}, ${
        ctx.resolve(count.value)
      })`,
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
  (ctx, e1, e2, e3) =>
    snip(
      `faceForward(${ctx.resolve(e1.value)}, ${ctx.resolve(e2.value)}, ${
        ctx.resolve(e3.value)
      })`,
      e1.dataType,
    ),
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
  (ctx, value) =>
    snip(`firstLeadingBit(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) =>
    snip(`firstTrailingBit(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`floor(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, e1, e2, e3) =>
    snip(
      `fma(${ctx.resolve(e1.value)}, ${ctx.resolve(e2.value)}, ${
        ctx.resolve(e3.value)
      })`,
      e1.dataType,
    ),
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
  (ctx, a) => snip(`fract(${ctx.resolve(a.value)})`, a.dataType),
  'fract',
);

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
  (ctx, value) => {
    const returnType =
      FrexpResults[value.dataType.type as keyof typeof FrexpResults];

    if (!returnType) {
      throw new Error(
        `Unsupported data type for frexp: ${value.dataType.type}. Supported types are f32, f16, abstractFloat, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h.`,
      );
    }

    return snip(
      `frexp(${ctx.resolve(value.value)})`,
      returnType,
    );
  },
  'frexp',
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
  (ctx, e, newbits, offset, count) =>
    snip(
      `insertBits(${ctx.resolve(e.value)}, ${ctx.resolve(newbits.value)}, ${
        ctx.resolve(offset.value)
      }, ${ctx.resolve(count.value)})`,
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
  (ctx, value) =>
    snip(`inverseSqrt(${ctx.resolve(value.value)})`, value.dataType),
  'inverseSqrt',
);

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
  (ctx, e1, e2) =>
    snip(
      `ldexp(${ctx.resolve(e1.value)}, ${ctx.resolve(e2.value)})`,
      e1.dataType,
    ),
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
export const length = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance | number>(value: T): number => {
    if (typeof value === 'number') {
      return Math.abs(value);
    }
    return VectorOps.length[value.kind](value);
  },
  // GPU implementation
  (ctx, value) => snip(`length(${ctx.resolve(value.value)})`, f32),
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
  (ctx, value) => snip(`log(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`log2(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, a, b) =>
    snip(`max(${ctx.resolve(a.value)}, ${ctx.resolve(b.value)})`, a.dataType),
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
  (ctx, a, b) =>
    snip(`min(${ctx.resolve(a.value)}, ${ctx.resolve(b.value)})`, a.dataType),
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
  (ctx, e1, e2, e3) =>
    snip(
      `mix(${ctx.resolve(e1.value)}, ${ctx.resolve(e2.value)}, ${
        ctx.resolve(e3.value)
      })`,
      e1.dataType,
    ),
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
  (ctx, value) => {
    const returnType =
      ModfResult[value.dataType.type as keyof typeof ModfResult];

    if (!returnType) {
      throw new Error(
        `Unsupported data type for modf: ${value.dataType.type}. Supported types are f32, f16, abstractFloat, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h.`,
      );
    }

    return snip(
      `modf(${ctx.resolve(value.value)})`,
      returnType,
    );
  },
  'modf',
);

export const normalize = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance>(v: T): T => VectorOps.normalize[v.kind](v),
  // GPU implementation
  (ctx, v) => snip(`normalize(${ctx.resolve(v.value)})`, v.dataType),
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
  (ctx, base, exponent) =>
    snip(
      `pow(${ctx.resolve(base.value)}, ${ctx.resolve(exponent.value)})`,
      base.dataType,
    ),
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
  (ctx, value) =>
    snip(`quantizeToF16(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`radians(${ctx.resolve(value.value)})`, value.dataType),
  'radians',
);

export const reflect = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance>(e1: T, e2: T): T =>
    sub(e1, mul(2 * dot(e2, e1), e2)),
  // GPU implementation
  (ctx, e1, e2) =>
    snip(
      `reflect(${ctx.resolve(e1.value)}, ${ctx.resolve(e2.value)})`,
      e1.dataType,
    ),
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
  (ctx, e1, e2, e3) =>
    snip(
      `refract(${ctx.resolve(e1.value)}, ${ctx.resolve(e2.value)}, ${
        ctx.resolve(e3.value)
      })`,
      e1.dataType,
    ),
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
  (ctx, value) =>
    snip(`reverseBits(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`round(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`saturate(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, e) => snip(`sign(${ctx.resolve(e.value)})`, e.dataType),
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
  (ctx, value) => snip(`sin(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`sinh(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, edge0, edge1, x) =>
    snip(
      `smoothstep(${ctx.resolve(edge0.value)}, ${ctx.resolve(edge1.value)}, ${
        ctx.resolve(x.value)
      })`,
      x.dataType,
    ),
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
  (ctx, value) => snip(`sqrt(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, edge, x) =>
    snip(
      `step(${ctx.resolve(edge.value)}, ${ctx.resolve(x.value)})`,
      edge.dataType,
    ),
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
  (ctx, value) => snip(`tan(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, value) => snip(`tanh(${ctx.resolve(value.value)})`, value.dataType),
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
  (ctx, e) => {
    return snip(`transpose(${ctx.resolve(e.value)})`, e.dataType);
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
  (ctx, value) => snip(`trunc(${ctx.resolve(value.value)})`, value.dataType),
  'trunc',
);
