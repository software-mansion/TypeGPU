import { bool, f32 } from '../data/numeric';
import { VectorOps } from '../data/vectorOps';
import type {
  AnyMatInstance,
  AnyWgslData,
  VecKind,
  v2f,
  v2h,
  v3f,
  v3h,
  v3i,
  v3u,
  v4f,
  v4h,
  vBaseForMat,
} from '../data/wgslTypes';
import { createDualImpl } from '../shared/generators';
import type { Snippet } from '../types';

function isNumeric(element: Snippet) {
  const type = element.dataType.type;
  return (
    type === 'abstractInt' ||
    type === 'abstractFloat' ||
    type === 'f32' ||
    type === 'f16' ||
    type === 'i32' ||
    type === 'u32'
  );
}

type vBase = { kind: VecKind };

export const add = createDualImpl(
  // CPU implementation
  <T extends vBase>(lhs: T, rhs: T): T => VectorOps.add[lhs.kind](lhs, rhs),
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} + ${rhs.value})`,
    dataType: lhs.dataType,
  }),
);

export const sub = createDualImpl(
  // CPU implementation
  <T extends vBase>(lhs: T, rhs: T): T => VectorOps.sub[lhs.kind](lhs, rhs),
  // GPU implementation
  (lhs, rhs) => ({
    value: `(${lhs.value} - ${rhs.value})`,
    dataType: lhs.dataType,
  }),
);

type MulOverload = {
  <T extends AnyMatInstance, TVec extends vBaseForMat<T>>(s: T, v: TVec): TVec;
  <T extends AnyMatInstance, TVec extends vBaseForMat<T>>(s: TVec, v: T): TVec;
  <T extends vBase | AnyMatInstance>(s: number | T, v: T): T;
};

export const mul: MulOverload = createDualImpl(
  // CPU implementation
  (
    s: number | vBase | AnyMatInstance,
    v: vBase | AnyMatInstance,
  ): vBase | AnyMatInstance => {
    if (typeof s === 'number') {
      // Scalar * Vector/Matrix case
      return VectorOps.mulSxV[v.kind](s, v);
    }
    if (
      typeof s === 'object' &&
      typeof v === 'object' &&
      'kind' in s &&
      'kind' in v
    ) {
      const sIsVector = !s.kind.startsWith('mat');
      const vIsVector = !v.kind.startsWith('mat');
      if (!sIsVector && vIsVector) {
        // Matrix * Vector case
        return VectorOps.mulMxV[(s as AnyMatInstance).kind](
          s as AnyMatInstance,
          v as vBaseForMat<AnyMatInstance>,
        );
      }
      if (sIsVector && !vIsVector) {
        // Vector * Matrix case
        return VectorOps.mulVxM[(v as AnyMatInstance).kind](
          s as vBaseForMat<AnyMatInstance>,
          v as AnyMatInstance,
        );
      }
    }
    // Vector * Vector or Matrix * Matrix case
    return VectorOps.mulVxV[v.kind](s, v);
  },
  // GPU implementation
  (s, v) => {
    const returnType = isNumeric(s)
      ? // Scalar * Vector/Matrix
        (v.dataType as AnyWgslData)
      : !s.dataType.type.startsWith('mat')
        ? // Vector * Matrix
          (s.dataType as AnyWgslData)
        : !v.dataType.type.startsWith('mat')
          ? // Matrix * Vector
            (v.dataType as AnyWgslData)
          : // Vector * Vector or Matrix * Matrix
            (s.dataType as AnyWgslData);
    return { value: `(${s.value} * ${v.value})`, dataType: returnType };
  },
);

export const abs = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.abs(value) as T;
    }
    return VectorOps.abs[value.kind](value) as T;
  },
  // GPU implementation
  (value) => ({ value: `abs(${value.value})`, dataType: value.dataType }),
);

export const atan2 = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(y: T, x: T): T => {
    if (typeof y === 'number' && typeof x === 'number') {
      return Math.atan2(y, x) as T;
    }
    return VectorOps.atan2[(y as vBase).kind](y as never, x as never) as T;
  },
  // GPU implementation
  (y, x) => ({ value: `atan2(${y.value}, ${x.value})`, dataType: y.dataType }),
);

export const acos = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.acos(value) as T;
    }
    return VectorOps.acos[(value as vBase).kind](value as never) as T;
  },
  // GPU implementation
  (value) => ({ value: `acos(${value.value})`, dataType: value.dataType }),
);

export const asin = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.asin(value) as T;
    }
    return VectorOps.asin[(value as vBase).kind](value as never) as T;
  },
  // GPU implementation
  (value) => ({ value: `asin(${value.value})`, dataType: value.dataType }),
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#ceil-builtin
 */
export const ceil = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.ceil(value) as T;
    }
    return VectorOps.ceil[value.kind](value) as T;
  },
  // GPU implementation
  (value) => ({ value: `ceil(${value.value})`, dataType: value.dataType }),
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#clamp
 */
export const clamp = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(value: T, low: T, high: T): T => {
    if (typeof value === 'number') {
      return Math.min(Math.max(low as number, value), high as number) as T;
    }
    return VectorOps.clamp[value.kind](value, low as vBase, high as vBase) as T;
  },
  // GPU implementation
  (value, low, high) => {
    return {
      value: `clamp(${value.value}, ${low.value}, ${high.value})`,
      dataType: value.dataType,
    };
  },
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#cos-builtin
 */
export const cos = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.cos(value) as T;
    }
    return VectorOps.cos[value.kind](value) as T;
  },
  // GPU implementation
  (value) => ({ value: `cos(${value.value})`, dataType: value.dataType }),
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#cross-builtin
 */
export const cross = createDualImpl(
  // CPU implementation
  <T extends v3f | v3i | v3u>(a: T, b: T): T => VectorOps.cross[a.kind](a, b),
  // GPU implementation
  (a, b) => ({ value: `cross(${a.value}, ${b.value})`, dataType: a.dataType }),
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#dot-builtin
 */
export const dot = createDualImpl(
  // CPU implementation
  <T extends vBase>(lhs: T, rhs: T): number =>
    VectorOps.dot[lhs.kind](lhs, rhs),
  // GPU implementation
  (lhs, rhs) => ({ value: `dot(${lhs.value}, ${rhs.value})`, dataType: f32 }),
);

export const normalize = createDualImpl(
  // CPU implementation
  <T extends vBase>(v: T): T => VectorOps.normalize[v.kind](v),
  // GPU implementation
  (v) => ({ value: `normalize(${v.value})`, dataType: v.dataType }),
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#floor-builtin
 */
export const floor = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.floor(value) as T;
    }
    return VectorOps.floor[value.kind](value) as T;
  },
  // GPU implementation
  (value) => ({ value: `floor(${value.value})`, dataType: value.dataType }),
);

export const fract = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(a: T): T => {
    if (typeof a === 'number') {
      return (a - Math.floor(a)) as T;
    }
    return VectorOps.fract[a.kind](a) as T;
  },
  // GPU implementation
  (a) => ({ value: `fract(${a.value})`, dataType: a.dataType }),
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#length-builtin
 */
export const length = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(value: T): number => {
    if (typeof value === 'number') {
      return Math.abs(value);
    }
    return VectorOps.length[value.kind](value);
  },
  // GPU implementation
  (value) => ({ value: `length(${value.value})`, dataType: f32 }),
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#max-float-builtin
 */
export const max = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(a: T, b: T): T => {
    if (typeof a === 'number') {
      return Math.max(a, b as number) as T;
    }
    return VectorOps.max[a.kind](a, b as vBase) as T;
  },
  // GPU implementation
  (a, b) => ({ value: `max(${a.value}, ${b.value})`, dataType: a.dataType }),
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#min-float-builtin
 */
export const min = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(a: T, b: T): T => {
    if (typeof a === 'number') {
      return Math.min(a, b as number) as T;
    }
    return VectorOps.min[a.kind](a, b as vBase) as T;
  },
  // GPU implementation
  (a, b) => ({ value: `min(${a.value}, ${b.value})`, dataType: a.dataType }),
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#sin-builtin
 */
export const sin = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.sin(value) as T;
    }
    return VectorOps.sin[value.kind](value) as T;
  },
  // GPU implementation
  (value) => ({ value: `sin(${value.value})`, dataType: value.dataType }),
);

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#exp-builtin
 */
export const exp = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(value: T): T => {
    if (typeof value === 'number') {
      return Math.exp(value) as T;
    }
    return VectorOps.exp[value.kind](value) as T;
  },
  // GPU implementation
  (value) => ({ value: `exp(${value.value})`, dataType: value.dataType }),
);

type PowOverload = {
  (base: number, exponent: number): number;
  <T extends v2f | v3f | v4f | v2h | v3h | v4h>(base: T, exponent: T): T;
};

export const pow: PowOverload = createDualImpl(
  // CPU implementation
  <T extends v2f | v3f | v4f | v2h | v3h | v4h | number>(
    base: T,
    exponent: T,
  ): T => {
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
  (base, exponent) => {
    return {
      value: `pow(${base.value}, ${exponent.value})`,
      dataType: base.dataType,
    };
  },
);

type MixOverload = {
  (e1: number, e2: number, e3: number): number;
  <T extends v2f | v3f | v4f | v2h | v3h | v4h>(e1: T, e2: T, e3: number): T;
  <T extends v2f | v3f | v4f | v2h | v3h | v4h>(e1: T, e2: T, e3: T): T;
};

export const mix: MixOverload = createDualImpl(
  // CPU implementation
  <T extends v2f | v3f | v4f | v2h | v3h | v4h | number>(
    e1: T,
    e2: T,
    e3: T | number,
  ): T => {
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
  (e1, e2, e3) => {
    return {
      value: `mix(${e1.value}, ${e2.value}, ${e3.value})`,
      dataType: e1.dataType,
    };
  },
);

export const reflect = createDualImpl(
  // CPU implementation
  <T extends vBase>(e1: T, e2: T): T => sub(e1, mul(2 * dot(e2, e1), e2)),
  // GPU implementation
  (e1, e2) => {
    return {
      value: `reflect(${e1.value}, ${e2.value})`,
      dataType: e1.dataType,
    };
  },
);

export const distance = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(a: T, b: T): number => {
    if (typeof a === 'number' && typeof b === 'number') {
      return Math.abs(a - b);
    }
    return length(sub(a as vBase, b as vBase)) as number;
  },
  // GPU implementation
  (a, b) => ({ value: `distance(${a.value}, ${b.value})`, dataType: f32 }),
);

/**
 * Checks whether the given elements differ by at most 0.01.
 * Component-wise if arguments are vectors.
 * @example
 * isCloseTo(0, 0.1) // returns false
 * isCloseTo(vec3f(0, 0, 0), vec3f(0.002, -0.009, 0)) // returns true
 *
 * @param {number} precision argument that specifies the maximum allowed difference, 0.01 by default.
 */
export const isCloseTo = createDualImpl(
  // CPU implementation
  <T extends v2f | v3f | v4f | v2h | v3h | v4h | number>(
    e1: T,
    e2: T,
    precision = 0.01,
  ) => {
    if (typeof e1 === 'number' && typeof e2 === 'number') {
      return Math.abs(e1 - e2) < precision;
    }
    if (typeof e1 !== 'number' && typeof e2 !== 'number') {
      return VectorOps.isCloseToZero[e1.kind](sub(e1, e2), precision);
    }
    return false;
  },
  // GPU implementation
  (e1, e2, precision = { value: 0.01, dataType: f32 }) => {
    if (isNumeric(e1) && isNumeric(e2)) {
      return {
        value: `abs(f32(${e1.value})-f32(${e2.value})) <= ${precision.value}`,
        dataType: bool,
      };
    }
    if (!isNumeric(e1) && !isNumeric(e2)) {
      return {
        // https://www.w3.org/TR/WGSL/#vector-multi-component:~:text=Binary%20arithmetic%20expressions%20with%20mixed%20scalar%20and%20vector%20operands
        // (a-a)+prec creates a vector of a.length elements, all equal to prec
        value: `all(abs(${e1.value}-${e2.value}) <= (${e1.value} - ${e1.value})+${precision.value})`,
        dataType: bool,
      };
    }
    return {
      value: 'false',
      dataType: bool,
    };
  },
);

export const neg = createDualImpl(
  // CPU implementation
  <T extends vBase | number>(value: T): T => {
    if (typeof value === 'number') {
      return -value as T;
    }
    return VectorOps.neg[value.kind](value) as T;
  },
  // GPU implementation
  (value) => ({ value: `-(${value.value})`, dataType: value.dataType }),
);
