import { createDualImpl } from '../core/function/dualImpl.ts';
import type { AnyData, TgpuDualFn } from '../data/dataTypes.ts';
import { f32 } from '../data/numeric.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import { vecTypeToConstructor } from '../data/vector.ts';
import { VectorOps } from '../data/vectorOps.ts';
import {
  type AbstractFloat,
  type AbstractInt,
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
  type vBaseForMat,
} from '../data/wgslTypes.ts';
import { $internal } from '../shared/symbols.ts';

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

export function isSnippetNumeric(snippet: Snippet) {
  return isNumericSchema(snippet.dataType);
}

type NumVec = AnyNumericVecInstance;
type Mat = AnyMatInstance;

function cpuAdd(lhs: number, rhs: number): number; // default addition
function cpuAdd<T extends NumVec>(lhs: number, rhs: T): T; // mixed addition
function cpuAdd<T extends NumVec>(lhs: T, rhs: number): T; // mixed addition
function cpuAdd<T extends NumVec | Mat>(lhs: T, rhs: T): T; // component-wise addition
function cpuAdd<
  // union overload
  Lhs extends number | NumVec | Mat,
  Rhs extends Lhs extends number ? number | NumVec
    : Lhs extends NumVec ? number | Lhs
    : Lhs extends Mat ? Lhs
    : never,
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
  'unify',
);

function cpuSub(lhs: number, rhs: number): number; // default subtraction
function cpuSub<T extends NumVec>(lhs: number, rhs: T): T; // mixed subtraction
function cpuSub<T extends NumVec>(lhs: T, rhs: number): T; // mixed subtraction
function cpuSub<T extends NumVec | Mat>(lhs: T, rhs: T): T; // component-wise subtraction
function cpuSub<
  // union overload
  Lhs extends number | NumVec | Mat,
  Rhs extends Lhs extends number ? number | NumVec
    : Lhs extends NumVec ? number | Lhs
    : Lhs extends Mat ? Lhs
    : never,
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
  'unify',
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
  Rhs extends Lhs extends number ? number | NumVec | Mat
    : Lhs extends NumVec ? number | Lhs | mBaseForVec<Lhs>
    : Lhs extends Mat ? number | vBaseForMat<Lhs> | Lhs
    : never,
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

type DivOverload = {
  (lhs: number, rhs: number): number; // default js division
  <T extends NumVec | number>(lhs: T, rhs: T): T; // component-wise division
  <T extends NumVec | number>(lhs: number, rhs: T): T; // mixed division
  <T extends NumVec | number>(lhs: T, rhs: number): T; // mixed division
};

export const div: TgpuDualFn<DivOverload> = createDualImpl(
  // CPU implementation
  <T extends NumVec | number>(lhs: T, rhs: T): T => {
    if (typeof lhs === 'number' && typeof rhs === 'number') {
      return (lhs / rhs) as T;
    }
    if (typeof lhs === 'number' && isVecInstance(rhs)) {
      const schema = vecTypeToConstructor[rhs.kind];
      return VectorOps.div[rhs.kind](schema(lhs), rhs) as T;
    }
    if (isVecInstance(lhs) && typeof rhs === 'number') {
      const schema = vecTypeToConstructor[lhs.kind];
      return VectorOps.div[lhs.kind](lhs, schema(rhs)) as T;
    }
    if (isVecInstance(lhs) && isVecInstance(rhs)) {
      return VectorOps.div[lhs.kind](lhs, rhs) as T;
    }
    throw new Error('Div called with invalid arguments.');
  },
  // GPU implementation
  (lhs, rhs) => {
    if (isSnippetNumeric(lhs) && isSnippetNumeric(rhs)) {
      return snip(`(f32(${lhs.value}) / ${rhs.value})`, f32);
    }
    return snip(`(${lhs.value} / ${rhs.value})`, lhs.dataType);
  },
  'div',
);

type ModOverload = {
  (a: number, b: number): number;
  <T extends NumVec>(a: T, b: T): T;
  <T extends NumVec>(a: number, b: T): T;
  <T extends NumVec>(a: T, b: number): T;
};

/**
 * @privateRemarks
 * Both JS and WGSL implementations use truncated definition of modulo
 */
export const mod: ModOverload = createDualImpl(
  // CPU implementation
  <T extends NumVec | number>(a: T, b: T): T => {
    if (typeof a === 'number' && typeof b === 'number') {
      return (a % b) as T; // scalar % scalar
    }
    if (typeof a === 'number' && isVecInstance(b)) {
      // scalar % vector
      const schema = vecTypeToConstructor[b.kind];
      return VectorOps.mod[b.kind](schema(a), b) as T;
    }
    if (isVecInstance(a) && typeof b === 'number') {
      const schema = vecTypeToConstructor[a.kind];
      // vector % scalar
      return VectorOps.mod[a.kind](a, schema(b)) as T;
    }

    if (isVecInstance(a) && isVecInstance(b)) {
      // vector % vector
      return VectorOps.mod[a.kind](a, b) as T;
    }
    throw new Error(
      'Mod called with invalid arguments, expected types: number or vector.',
    );
  },
  // GPU implementation
  (a, b) => {
    const type = isSnippetNumeric(a) ? b.dataType : a.dataType;
    return snip(`(${a.value} % ${b.value})`, type);
  },
  'mod',
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
