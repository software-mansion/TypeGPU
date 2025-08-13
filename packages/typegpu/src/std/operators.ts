import { stitch } from '../core/resolve/stitch.ts';
import { createDualImpl } from '../core/function/dualImpl.ts';
import { f16, f32 } from '../data/numeric.ts';
import { isSnippetNumeric, snip, type Snippet } from '../data/snippet.ts';
import { vecTypeToConstructor } from '../data/vector.ts';
import { VectorOps } from '../data/vectorOps.ts';
import {
  type AnyMatInstance,
  type AnyNumericVecInstance,
  type AnyWgslData,
  isFloat32VecInstance,
  isMatInstance,
  isVecInstance,
  type mBaseForVec,
  type vBaseForMat,
} from '../data/wgslTypes.ts';
import { convertToCommonType } from '../tgsl/generationHelpers.ts';
import { getResolutionCtx } from '../execMode.ts';
import type { ResolutionCtx } from '../types.ts';
import { $internal } from '../shared/symbols.ts';
import { concretize } from '../tgsl/concretize.ts';

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

export const add = createDualImpl({
  name: 'add',
  // CPU implementation
  normalImpl: cpuAdd,
  // CODEGEN implementation
  codegenImpl: (lhs, rhs) => {
    const resultType = isSnippetNumeric(lhs) ? rhs.dataType : lhs.dataType;

    if (
      (typeof lhs.value === 'number' ||
        isVecInstance(lhs.value) ||
        isMatInstance(lhs.value)) &&
      (typeof rhs.value === 'number' ||
        isVecInstance(rhs.value) ||
        isMatInstance(rhs.value))
    ) {
      // Precomputing...
      return snip(cpuAdd(lhs.value as never, rhs.value as never), resultType);
    }

    return snip(stitch`(${lhs} + ${rhs})`, resultType);
  },
});

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
  return cpuAdd(lhs, cpuMul(-1, rhs));
}

export const sub = createDualImpl({
  name: 'sub',
  // CPU implementation
  normalImpl: cpuSub,
  // CODEGEN implementation
  codegenImpl: (lhs, rhs) => {
    const resultType = isSnippetNumeric(lhs) ? rhs.dataType : lhs.dataType;

    if (
      (typeof lhs.value === 'number' ||
        isVecInstance(lhs.value) ||
        isMatInstance(lhs.value)) &&
      (typeof rhs.value === 'number' ||
        isVecInstance(rhs.value) ||
        isMatInstance(rhs.value))
    ) {
      // Precomputing...
      return snip(cpuSub(lhs.value as never, rhs.value as never), resultType);
    }

    return snip(stitch`(${lhs} - ${rhs})`, resultType);
  },
});

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

export const mul = createDualImpl({
  name: 'mul',
  // CPU implementation
  normalImpl: cpuMul,
  // GPU implementation
  codegenImpl: (lhs, rhs) => {
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

    if (
      (typeof lhs.value === 'number' ||
        isVecInstance(lhs.value) ||
        isMatInstance(lhs.value)) &&
      (typeof rhs.value === 'number' ||
        isVecInstance(rhs.value) ||
        isMatInstance(rhs.value))
    ) {
      // Precomputing...
      return snip(cpuMul(lhs.value as never, rhs.value as never), returnType);
    }

    return snip(stitch`(${lhs} * ${rhs})`, returnType);
  },
});

function cpuDiv(lhs: number, rhs: number): number; // default js division
function cpuDiv<T extends NumVec | number>(lhs: T, rhs: T): T; // component-wise division
function cpuDiv<T extends NumVec | number>(lhs: number, rhs: T): T; // mixed division
function cpuDiv<T extends NumVec | number>(lhs: T, rhs: number): T; // mixed division
function cpuDiv(lhs: NumVec | number, rhs: NumVec | number): NumVec | number {
  if (typeof lhs === 'number' && typeof rhs === 'number') {
    return lhs / rhs;
  }
  if (typeof lhs === 'number' && isVecInstance(rhs)) {
    const schema = vecTypeToConstructor[rhs.kind][$internal].jsImpl;
    return VectorOps.div[rhs.kind](schema(lhs), rhs);
  }
  if (isVecInstance(lhs) && typeof rhs === 'number') {
    const schema = vecTypeToConstructor[lhs.kind][$internal].jsImpl;
    return VectorOps.div[lhs.kind](lhs, schema(rhs));
  }
  if (isVecInstance(lhs) && isVecInstance(rhs)) {
    return VectorOps.div[lhs.kind](lhs, rhs);
  }
  throw new Error('Div called with invalid arguments.');
}

export const div = createDualImpl({
  name: 'div',
  // CPU implementation
  normalImpl: cpuDiv,
  // CODEGEN implementation
  codegenImpl: (lhs, rhs) => {
    let conv: [Snippet, Snippet] = [lhs, rhs];

    if (isSnippetNumeric(lhs) && isSnippetNumeric(rhs)) {
      const ctx = getResolutionCtx() as ResolutionCtx;
      const converted = convertToCommonType({
        ctx,
        values: [lhs, rhs],
        restrictTo: [f32, f16],
      }) as
        | [Snippet, Snippet]
        | undefined;
      if (converted) {
        conv = converted;
      }
    }

    const lhsVal = conv[0].value;
    const rhsVal = conv[1].value;

    if (
      (typeof lhsVal === 'number' || isVecInstance(lhsVal)) &&
      (typeof rhsVal === 'number' || isVecInstance(rhsVal))
    ) {
      // Precomputing
      return snip(cpuDiv(lhsVal as never, rhsVal as never), conv[0].dataType);
    }

    return snip(stitch`(${conv[0]} / ${conv[1]})`, conv[0].dataType);
  },
});

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
export const mod: ModOverload = createDualImpl({
  name: 'mod',
  // CPU implementation
  normalImpl: <T extends NumVec | number>(a: T, b: T): T => {
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
  codegenImpl: (a, b) => {
    const type = isSnippetNumeric(a) ? b.dataType : a.dataType;
    return snip(stitch`(${a} % ${b})`, type);
  },
});

export const neg = createDualImpl({
  name: 'neg',
  // CPU implementation
  normalImpl: <T extends NumVec | number>(value: T): T => {
    if (typeof value === 'number') {
      return -value as T;
    }
    return VectorOps.neg[value.kind](value) as T;
  },
  // GPU implementation
  codegenImpl: (value) => snip(stitch`-(${value})`, value.dataType),
});
