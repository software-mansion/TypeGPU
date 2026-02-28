import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { abstractFloat, f16, f32 } from '../data/numeric.ts';
import { vecTypeToConstructor } from '../data/vector.ts';
import { VectorOps } from '../data/vectorOps.ts';
import {
  type AnyMatInstance,
  type AnyNumericVecInstance,
  type BaseData,
  isFloat32VecInstance,
  isMat,
  isMatInstance,
  isVec,
  isVecInstance,
  type mBaseForVec,
  type vBaseForMat,
} from '../data/wgslTypes.ts';
import { SignatureNotSupportedError } from '../errors.ts';
import { unify } from '../tgsl/conversion.ts';

type NumVec = AnyNumericVecInstance;
type Mat = AnyMatInstance;

const getPrimitive = (t: BaseData): BaseData => ('primitive' in t ? (t.primitive as BaseData) : t);

const makeBinarySignature =
  (opts?: { matVecProduct?: boolean; noMat?: boolean; restrict?: BaseData[] }) =>
  (lhs: BaseData, rhs: BaseData) => {
    const { restrict } = opts ?? {};
    const fail = (msg: string): never => {
      if (restrict) {
        throw new SignatureNotSupportedError([lhs, rhs], restrict);
      }
      throw new Error(`Cannot apply operator to ${lhs.type} and ${rhs.type}: ${msg}`);
    };

    if (opts?.noMat && (isMat(lhs) || isMat(rhs))) {
      return fail('matrices not supported');
    }
    const lhsC = isVec(lhs) || isMat(lhs);
    const rhsC = isVec(rhs) || isMat(rhs);

    if (!lhsC && !rhsC) {
      // scalar × scalar
      const unified = unify([lhs, rhs], restrict);
      if (!unified) return fail('incompatible scalar types');
      return { argTypes: unified, returnType: unified[0] };
    }

    if (lhsC && rhsC) {
      // vec × mat or mat × vec
      if (opts?.matVecProduct && isVec(lhs) !== isVec(rhs)) {
        return { argTypes: [lhs, rhs], returnType: isVec(lhs) ? lhs : rhs };
      }
      // composite × composite (same kind)
      if (lhs.type !== rhs.type) return fail('operands must have the same type');
      return { argTypes: [lhs, rhs], returnType: lhs };
    }

    // scalar × composite
    const [scalar, composite] = lhsC ? [rhs, lhs] : [lhs, rhs];
    const unified = unify([scalar], [getPrimitive(composite)]);
    if (!unified) {
      return fail(`scalar not convertible to ${getPrimitive(composite).type}`);
    }
    return {
      argTypes: lhsC ? [lhs, unified[0]] : [unified[0], rhs],
      returnType: composite,
    };
  };

const binaryArithmeticSignature = makeBinarySignature();
const binaryMulSignature = makeBinarySignature({ matVecProduct: true });
const binaryDivSignature = makeBinarySignature({
  noMat: true,
  restrict: [f32, f16, abstractFloat],
});

function cpuAdd(lhs: number, rhs: number): number; // default addition
function cpuAdd<T extends NumVec>(lhs: number, rhs: T): T; // mixed addition
function cpuAdd<T extends NumVec>(lhs: T, rhs: number): T; // mixed addition
function cpuAdd<T extends NumVec | Mat>(lhs: T, rhs: T): T; // component-wise addition
function cpuAdd<
  // union overload
  Lhs extends number | NumVec | Mat,
  Rhs extends Lhs extends number
    ? number | NumVec
    : Lhs extends NumVec
      ? number | Lhs
      : Lhs extends Mat
        ? Lhs
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
  if ((isVecInstance(lhs) && isVecInstance(rhs)) || (isMatInstance(lhs) && isMatInstance(rhs))) {
    return VectorOps.add[lhs.kind](lhs, rhs); // component-wise addition
  }

  throw new Error('Add/Sub called with invalid arguments.');
}

export const add = dualImpl({
  name: 'add',
  signature: binaryArithmeticSignature,
  normalImpl: cpuAdd,
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`(${lhs} + ${rhs})`,
});

function cpuSub(lhs: number, rhs: number): number; // default subtraction
function cpuSub<T extends NumVec>(lhs: number, rhs: T): T; // mixed subtraction
function cpuSub<T extends NumVec>(lhs: T, rhs: number): T; // mixed subtraction
function cpuSub<T extends NumVec | Mat>(lhs: T, rhs: T): T; // component-wise subtraction
function cpuSub<
  // union overload
  Lhs extends number | NumVec | Mat,
  Rhs extends Lhs extends number
    ? number | NumVec
    : Lhs extends NumVec
      ? number | Lhs
      : Lhs extends Mat
        ? Lhs
        : never,
>(lhs: Lhs, rhs: Rhs): Lhs | Rhs;
function cpuSub(lhs: number | NumVec | Mat, rhs: number | NumVec | Mat) {
  // while illegal on the wgsl side, we can do this in js
  return cpuAdd(lhs, cpuMul(-1, rhs));
}

export const sub = dualImpl({
  name: 'sub',
  signature: binaryArithmeticSignature,
  normalImpl: cpuSub,
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`(${lhs} - ${rhs})`,
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
  Rhs extends Lhs extends number
    ? number | NumVec | Mat
    : Lhs extends NumVec
      ? number | Lhs | mBaseForVec<Lhs>
      : Lhs extends Mat
        ? number | vBaseForMat<Lhs> | Lhs
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

export const mul = dualImpl({
  name: 'mul',
  signature: binaryMulSignature,
  normalImpl: cpuMul,
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`(${lhs} * ${rhs})`,
});

function cpuDiv(lhs: number, rhs: number): number; // default js division
function cpuDiv<T extends NumVec>(lhs: T, rhs: T): T; // component-wise division
function cpuDiv<T extends NumVec>(lhs: number, rhs: T): T; // mixed division
function cpuDiv<T extends NumVec>(lhs: T, rhs: number): T; // mixed division
function cpuDiv(lhs: NumVec | number, rhs: NumVec | number): NumVec | number {
  if (typeof lhs === 'number' && typeof rhs === 'number') {
    return lhs / rhs;
  }
  if (typeof lhs === 'number' && isVecInstance(rhs)) {
    const schema = vecTypeToConstructor[rhs.kind];
    return VectorOps.div[rhs.kind](schema(lhs), rhs);
  }
  if (isVecInstance(lhs) && typeof rhs === 'number') {
    const schema = vecTypeToConstructor[lhs.kind];
    return VectorOps.div[lhs.kind](lhs, schema(rhs));
  }
  if (isVecInstance(lhs) && isVecInstance(rhs)) {
    return VectorOps.div[lhs.kind](lhs, rhs);
  }
  throw new Error('Div called with invalid arguments.');
}

export const div = dualImpl({
  name: 'div',
  signature: binaryDivSignature,
  normalImpl: cpuDiv,
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`(${lhs} / ${rhs})`,
  ignoreImplicitCastWarning: true,
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
export const mod = dualImpl({
  name: 'mod',
  signature: binaryDivSignature,
  normalImpl: (<T extends NumVec | number>(a: T, b: T): T => {
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
    throw new Error('Mod called with invalid arguments, expected types: number or vector.');
  }) as ModOverload,
  codegenImpl: (_ctx, [lhs, rhs]) => stitch`(${lhs} % ${rhs})`,
});

function cpuNeg(value: number): number;
function cpuNeg<T extends NumVec>(value: T): T;
function cpuNeg(value: NumVec | number): NumVec | number {
  if (typeof value === 'number') {
    return -value;
  }
  return VectorOps.neg[value.kind](value);
}

export const neg = dualImpl({
  name: 'neg',
  signature: (arg) => ({
    argTypes: [arg],
    returnType: arg,
  }),
  normalImpl: cpuNeg,
  codegenImpl: (_ctx, [arg]) => stitch`-(${arg})`,
});
