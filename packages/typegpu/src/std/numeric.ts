import { type AnyData, snip, type Snippet } from '../data/dataTypes.ts';
import { f32 } from '../data/numeric.ts';
import { VectorOps } from '../data/vectorOps.ts';
import {
  type AbstractFloat,
  type AbstractInt,
  type AnyFloatVecInstance,
  type AnyMatInstance,
  type AnyNumericVecInstance,
  type F16,
  type F32,
  type I32,
  isFloat32VecInstance,
  isMatInstance,
  isVecInstance,
  type mBaseForVec,
  type U32,
  type v2f,
  type v2h,
  type v2i,
  type v3f,
  type v3h,
  type v3i,
  type v4f,
  type v4h,
  type v4i,
  type vBaseForMat,
} from '../data/wgslTypes.ts';
import { createDualImpl } from '../shared/generators.ts';
import { $internal } from '../shared/symbols.ts';

type NumVec = AnyNumericVecInstance;
type Mat = AnyMatInstance;

export function isSnippetNumeric(snippet: Snippet) {
  return isNumericSchema(snippet.dataType);
}

export function isNumericSchema(
  schema: unknown,
): schema is AbstractInt | AbstractFloat | F32 | F16 | I32 | U32 {
  const type = (schema as AnyData)?.type;

  return (
    !!(schema as AnyData)?.[$internal] &&
    (type === 'abstractInt' ||
      type === 'abstractFloat' ||
      type === 'f32' ||
      type === 'f16' ||
      type === 'i32' ||
      type === 'u32')
  );
}

function cpuAdd(lhs: number, rhs: number): number; // default addition
function cpuAdd<T extends NumVec>(lhs: number, rhs: T): T; // mixed addition
function cpuAdd<T extends NumVec>(lhs: T, rhs: number): T; // mixed addition
function cpuAdd<T extends NumVec | Mat>(lhs: T, rhs: T): T; // component-wise addition
function cpuAdd<
  // union overload
  Lhs extends number | NumVec | Mat,
  Rhs extends (Lhs extends number ? number | NumVec
    : Lhs extends NumVec ? number | Lhs
    : Lhs extends Mat ? Lhs
    : never),
>(lhs: Lhs, rhs: Rhs): Lhs | Rhs;
function cpuAdd(lhs: number | NumVec | Mat, rhs: number | NumVec | Mat) {
  if (typeof lhs === 'number' && typeof rhs === 'number') {
    return lhs + rhs; // default addition
  }
  if (typeof lhs === 'number' && isVecInstance(rhs)) {
    return VectorOps.addMixed[rhs.kind](rhs, lhs); // mixed addition
  }
  if (isVecInstance(lhs) && typeof rhs === 'number') {
    return VectorOps.addMixed[lhs.kind](lhs, rhs); // mixed addition
  }
  if (
    (isVecInstance(lhs) && isVecInstance(rhs)) ||
    (isMatInstance(lhs) && isMatInstance(rhs))
  ) {
    return VectorOps.add[lhs.kind](lhs, rhs); // component-wise addition
  }

  throw new Error('Add/Sub called with invalid arguments.');
}

export const add = createDualImpl(
  // CPU implementation
  cpuAdd,
  // GPU implementation
  (lhs, rhs) =>
    snip(
      `(${lhs.value} + ${rhs.value})`,
      isSnippetNumeric(lhs) ? rhs.dataType : lhs.dataType,
    ),
  'coerce',
);

function cpuSub(lhs: number, rhs: number): number; // default subtraction
function cpuSub<T extends NumVec>(lhs: number, rhs: T): T; // mixed subtraction
function cpuSub<T extends NumVec>(lhs: T, rhs: number): T; // mixed subtraction
function cpuSub<T extends NumVec | Mat>(lhs: T, rhs: T): T; // component-wise subtraction
function cpuSub<
  // union overload
  Lhs extends number | NumVec | Mat,
  Rhs extends (Lhs extends number ? number | NumVec
    : Lhs extends NumVec ? number | Lhs
    : Lhs extends Mat ? Lhs
    : never),
>(lhs: Lhs, rhs: Rhs): Lhs | Rhs;
function cpuSub(lhs: number | NumVec | Mat, rhs: number | NumVec | Mat) {
  // while illegal on the wgsl side, we can do this in js
  return cpuAdd(lhs, mul(-1, rhs));
}

export const sub = createDualImpl(
  // CPU implementation
  cpuSub,
  // GPU implementation
  (lhs, rhs) =>
    snip(
      `(${lhs.value} - ${rhs.value})`,
      isSnippetNumeric(lhs) ? rhs.dataType : lhs.dataType,
    ),
  'sub',
  'coerce',
);

function cpuMul(lhs: number, rhs: number): number; // default multiplication
function cpuMul<MV extends NumVec | Mat>(lhs: number, rhs: MV): MV; // scale
function cpuMul<MV extends NumVec | Mat>(lhs: MV, rhs: number): MV; // scale
function cpuMul<V extends NumVec>(lhs: V, rhs: V): V; // component-wise multiplication
function cpuMul<M extends Mat, V extends vBaseForMat<M>>(lhs: V, rhs: M): V; // row-vector-matrix
function cpuMul<M extends Mat, V extends vBaseForMat<M>>(lhs: M, rhs: V): V; // matrix-column-vector
function cpuMul<M extends Mat>(lhs: M, rhs: M): M; // matrix multiplication
function cpuMul<
  // union overload
  Lhs extends number | NumVec | Mat,
  Rhs extends (
    Lhs extends number ? number | NumVec | Mat
      : Lhs extends NumVec ? number | Lhs | mBaseForVec<Lhs>
      : Lhs extends Mat ? number | vBaseForMat<Lhs> | Lhs
      : never
  ),
>(lhs: Lhs, rhs: Rhs): Lhs | Rhs;
function cpuMul(lhs: number | NumVec | Mat, rhs: number | NumVec | Mat) {
  if (typeof lhs === 'number' && typeof rhs === 'number') {
    return lhs * rhs; // default multiplication
  }
  if (typeof lhs === 'number' && (isVecInstance(rhs) || isMatInstance(rhs))) {
    return VectorOps.mulSxV[rhs.kind](lhs, rhs); // scale
  }
  if ((isVecInstance(lhs) || isMatInstance(lhs)) && typeof rhs === 'number') {
    return VectorOps.mulSxV[lhs.kind](rhs, lhs); // scale
  }
  if (isVecInstance(lhs) && isVecInstance(rhs)) {
    return VectorOps.mulVxV[lhs.kind](lhs, rhs); // component-wise
  }
  if (isFloat32VecInstance(lhs) && isMatInstance(rhs)) {
    return VectorOps.mulVxM[rhs.kind](lhs, rhs); // row-vector-matrix
  }
  if (isMatInstance(lhs) && isFloat32VecInstance(rhs)) {
    return VectorOps.mulMxV[lhs.kind](lhs, rhs); // matrix-column-vector
  }
  if (isMatInstance(lhs) && isMatInstance(rhs)) {
    return VectorOps.mulVxV[lhs.kind](lhs, rhs); // matrix multiplication
  }

  throw new Error('Mul called with invalid arguments.');
}

export const mul = createDualImpl(
  // CPU implementation
  cpuMul,
  // GPU implementation
  (lhs, rhs) => {
    const returnType = isSnippetNumeric(lhs)
      // Scalar * Scalar/Vector/Matrix
      ? rhs.dataType
      : isSnippetNumeric(rhs)
      // Vector/Matrix * Scalar
      ? lhs.dataType
      : lhs.dataType.type.startsWith('vec')
      // Vector * Vector/Matrix
      ? lhs.dataType
      : rhs.dataType.type.startsWith('vec')
      // Matrix * Vector
      ? rhs.dataType
      // Matrix * Matrix
      : lhs.dataType;
    return snip(`(${lhs.value} * ${rhs.value})`, returnType);
  },
  'mul',
);

function cpuDiv(lhs: number, rhs: number): number; // default js division
function cpuDiv<MV extends NumVec>(lhs: number, rhs: MV): MV; // scale
function cpuDiv<MV extends NumVec>(lhs: MV, rhs: number): MV; // scale
function cpuDiv<V extends NumVec>(lhs: V, rhs: V): V; // component-wise division
function cpuDiv<
  // union overload
  Lhs extends number | NumVec,
  Rhs extends (Lhs extends number ? number | NumVec
    : Lhs extends NumVec ? number | Lhs
    : never),
>(lhs: Lhs, rhs: Rhs): Lhs | Rhs;
function cpuDiv(lhs: number | NumVec, rhs: number | NumVec) {
  if (typeof lhs === 'number' && typeof rhs === 'number') {
    return (lhs / rhs);
  }
  if (typeof lhs === 'number' && isVecInstance(rhs)) {
    return VectorOps.divMixed[rhs.kind](rhs, lhs);
  }
  if (isVecInstance(lhs) && typeof rhs === 'number') {
    return VectorOps.divMixed[lhs.kind](lhs, rhs);
  }
  if (isVecInstance(lhs) && isVecInstance(rhs)) {
    return VectorOps.div[lhs.kind](lhs, rhs);
  }

  throw new Error('Div called with invalid arguments.');
}

export const div = createDualImpl(
  // CPU implementation
  cpuDiv,
  // GPU implementation
  (lhs, rhs) => {
    if (isSnippetNumeric(lhs) && isSnippetNumeric(rhs)) {
      return snip(`(f32(${lhs.value}) / ${rhs.value})`, f32);
    }
    return snip(`(${lhs.value} / ${rhs.value})`, lhs.dataType);
  },
  'div',
);

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

export const normalize = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance>(v: T): T => VectorOps.normalize[v.kind](v),
  // GPU implementation
  (v) => snip(`normalize(${v.value})`, v.dataType),
  'normalize',
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
  'coerce',
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
  'coerce',
);

export const sign = createDualImpl(
  // CPU implementation
  //         \/ specifically no unsigned variants
  <T extends v2f | v2h | v2i | v3f | v3h | v3i | v4f | v4h | v4i | number>(
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

export const reflect = createDualImpl(
  // CPU implementation
  <T extends AnyFloatVecInstance>(e1: T, e2: T): T =>
    sub(e1, mul(2 * dot(e2, e1), e2)),
  // GPU implementation
  (e1, e2) => snip(`reflect(${e1.value}, ${e2.value})`, e1.dataType),
  'reflect',
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
  (a, b) => snip(`distance(${a.value}, ${b.value})`, f32),
  'distance',
);

export const neg = createDualImpl(
  // CPU implementation
  <T extends NumVec | number>(value: T): T => {
    if (typeof value === 'number') {
      return -value as T;
    }
    return VectorOps.neg[value.kind](value) as T;
  },
  // GPU implementation
  (value) => snip(`-(${value.value})`, value.dataType),
  'neg',
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
