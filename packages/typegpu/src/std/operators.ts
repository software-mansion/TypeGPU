import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { abstractFloat, f16, f32, u32 } from '../data/numeric.ts';
import { vec2i, vec2u, vec3i, vec3u, vec4i, vec4u } from '../data/vector.ts';
import { VectorOps } from '../data/vectorOps.ts';
import {
  generalizeFn,
  kindOf,
  numericKind,
  numericOrMatrixKind,
  signedKind,
  upCast,
  verifyEqualKinds,
  verifyKind,
} from '../data/generalizeFn.ts';
import {
  type AnyIntegerVecInstance,
  type AnyMatInstance,
  type AnyNumericVecInstance,
  type AnySignedVecInstance,
  type BaseData,
  type mBaseForVec,
  type vBaseForMat,
  isFloat32VecInstance,
  isMat,
  isMatInstance,
  isVec,
  isVecInstance,
  type vecIToVecU,
  isInteger32VecInstance,
  isUint32VecInstance,
} from '../data/wgslTypes.ts';
import { SignatureNotSupportedError, WgslTypeError } from '../errors.ts';
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
function cpuAdd(lhs: number | NumVec | Mat, rhs: number | NumVec | Mat): number | NumVec | Mat {
  verifyKind([lhs, rhs], numericOrMatrixKind);
  if (isMatInstance(lhs) !== isMatInstance(rhs)) {
    throw new WgslTypeError('There is no matrix/non-matrix addition or subtraction in WGSL.');
  }
  if ((typeof lhs === 'number') === (typeof rhs === 'number')) {
    // If exactly one is a number, then it's fine, since we already know the other one is not a matrix.
    verifyEqualKinds(lhs, rhs);
  }
  return generalizeFn((a, b) => a + b, upCast([lhs, rhs]));
}

export const add = dualImpl({
  name: 'add',
  signature: binaryArithmeticSignature,
  normalImpl: cpuAdd,
  codegenImpl: (ctx, [lhs, rhs]) => ctx.gen.emitBinaryOp(lhs, '+', rhs),
  sideEffects: false,
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
  codegenImpl: (ctx, [lhs, rhs]) => ctx.gen.emitBinaryOp(lhs, '-', rhs),
  sideEffects: false,
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
  verifyKind([lhs, rhs], numericOrMatrixKind);

  if (typeof lhs === 'number' && typeof rhs === 'number') {
    return lhs * rhs; // default multiplication
  }
  if (typeof lhs === 'number' && (isVecInstance(rhs) || isMatInstance(rhs))) {
    return generalizeFn((e) => lhs * e, [rhs]); // scale
  }
  if ((isVecInstance(lhs) || isMatInstance(lhs)) && typeof rhs === 'number') {
    return generalizeFn((e) => e * rhs, [lhs]); // scale
  }
  if (isVecInstance(lhs) && isVecInstance(rhs)) {
    verifyEqualKinds(lhs, rhs);
    return generalizeFn((a, b) => a * b, [lhs, rhs]); // component-wise
  }
  if (isFloat32VecInstance(lhs) && isMatInstance(rhs)) {
    if (lhs.length !== rhs.columns.length) {
      throw new WgslTypeError(
        `Unsupported signature. Kind '${kindOf(lhs)}' cannot be multiplied by '${kindOf(rhs)}'.`,
      );
    }
    return VectorOps.mulVxM[rhs.kind](lhs, rhs); // row-vector-matrix
  }
  if (isMatInstance(lhs) && isFloat32VecInstance(rhs)) {
    if (lhs.columns.length !== rhs.length) {
      throw new WgslTypeError(
        `Unsupported signature. Kind '${kindOf(lhs)}' cannot be multiplied by '${kindOf(rhs)}'.`,
      );
    }
    return VectorOps.mulMxV[lhs.kind](lhs, rhs); // matrix-column-vector
  }
  if (isMatInstance(lhs) && isMatInstance(rhs)) {
    verifyEqualKinds(lhs, rhs);
    return VectorOps.mulMxM[lhs.kind](lhs, rhs); // matrix multiplication
  }

  throw new WgslTypeError(
    `Unsupported signature. Kind '${kindOf(lhs)}' cannot be multiplied by '${kindOf(rhs)}'`,
  );
}

export const mul = dualImpl({
  name: 'mul',
  signature: binaryMulSignature,
  normalImpl: cpuMul,
  codegenImpl: (ctx, [lhs, rhs]) => ctx.gen.emitBinaryOp(lhs, '*', rhs),
  sideEffects: false,
});

function cpuDiv(lhs: number, rhs: number): number; // default js division
function cpuDiv<T extends NumVec>(lhs: T, rhs: T): T; // component-wise division
function cpuDiv<T extends NumVec>(lhs: number, rhs: T): T; // mixed division
function cpuDiv<T extends NumVec>(lhs: T, rhs: number): T; // mixed division
function cpuDiv(lhs: NumVec | number, rhs: NumVec | number): NumVec | number {
  verifyKind([lhs, rhs], numericKind);
  const upCasted = upCast([lhs, rhs]);
  verifyEqualKinds(...upCasted);
  return generalizeFn((a, b) => a / b, upCasted);
}

export const div = dualImpl({
  name: 'div',
  signature: binaryDivSignature,
  normalImpl: cpuDiv,
  codegenImpl: (ctx, [lhs, rhs]) => ctx.gen.emitBinaryOp(lhs, '/', rhs),
  ignoreImplicitCastWarning: true,
  sideEffects: false,
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
    verifyKind([a, b], numericKind);
    const upCasted = upCast([a, b]);
    verifyEqualKinds(...upCasted);
    return generalizeFn((a, b) => a % b, upCasted);
  }) as ModOverload,
  codegenImpl: (ctx, [lhs, rhs]) => ctx.gen.emitBinaryOp(lhs, '%', rhs),
  sideEffects: false,
});

function cpuNeg(value: number): number;
function cpuNeg<T extends AnySignedVecInstance>(value: T): T;
function cpuNeg(value: NumVec | number): NumVec | number {
  verifyKind(value, signedKind);
  return generalizeFn((value) => -value, [value]);
}

export const neg = dualImpl({
  name: 'neg',
  signature: (arg) => ({
    argTypes: [arg],
    returnType: arg,
  }),
  normalImpl: cpuNeg,
  codegenImpl: (_ctx, [arg]) => stitch`-(${arg})`,
  sideEffects: false,
});

const intVecToUnsignedVec = {
  vec2i: vec2u,
  vec2u: vec2u,
  vec3i: vec3u,
  vec3u: vec3u,
  vec4i: vec4u,
  vec4u: vec4u,
} as const;

const bitShiftSignature = (lhs: BaseData, rhs: BaseData) => {
  const lhsUnified = unify([lhs], [vec2i, vec3i, vec4i, vec2u, vec3u, vec4u])?.[0];
  if (!lhsUnified || !isVec(lhsUnified)) {
    throw new SignatureNotSupportedError([lhs], [vec2i, vec3i, vec4i, vec2u, vec3u, vec4u]);
  }

  const cc = lhsUnified.componentCount;
  const vecU = cc === 2 ? vec2u : cc === 3 ? vec3u : vec4u;
  const rhsUnified = unify([rhs], [u32, vecU])?.[0];
  if (!rhsUnified) {
    throw new SignatureNotSupportedError([rhs], [u32, vecU]);
  }

  return {
    argTypes: [lhsUnified, rhsUnified],
    returnType: lhsUnified,
  };
};

function cpuBitShiftLeft<T extends AnyIntegerVecInstance>(lhs: T, rhs: number | vecIToVecU<T>): T {
  if (isInteger32VecInstance(lhs) && isUint32VecInstance(rhs) && lhs.length == rhs.length) {
    return VectorOps.bitShiftLeft[lhs.kind](lhs, rhs);
  }

  if (isInteger32VecInstance(lhs) && typeof rhs === 'number') {
    const rhsVec = intVecToUnsignedVec[lhs.kind](rhs);
    return VectorOps.bitShiftLeft[lhs.kind](lhs, rhsVec);
  }

  throw new Error(
    "'bitShiftLeft' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.",
  );
}

export const bitShiftLeft = dualImpl({
  name: 'bitShiftLeft',
  signature: bitShiftSignature,
  normalImpl: cpuBitShiftLeft,
  codegenImpl: (ctx, [lhs, rhs]) => {
    if (isVec(lhs.dataType) && !isVec(rhs.dataType)) {
      const cc = lhs.dataType.componentCount;
      const schema = cc === 2 ? vec2u : cc === 3 ? vec3u : vec4u;
      return ctx.gen.emitBinaryOp(lhs, '<<', ctx.gen.typeInstantiation(schema, [rhs]));
    }
    return ctx.gen.emitBinaryOp(lhs, '<<', rhs);
  },
  sideEffects: false,
});

function cpuBitShiftRight<T extends AnyIntegerVecInstance>(lhs: T, rhs: number | vecIToVecU<T>): T {
  if (isInteger32VecInstance(lhs) && isUint32VecInstance(rhs) && lhs.length == rhs.length) {
    return VectorOps.bitShiftRight[lhs.kind](lhs, rhs);
  }

  if (isInteger32VecInstance(lhs) && typeof rhs === 'number') {
    const rhsVec = intVecToUnsignedVec[lhs.kind](rhs);
    return VectorOps.bitShiftRight[lhs.kind](lhs, rhsVec);
  }

  throw new Error(
    "'bitShiftRight' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.",
  );
}

export const bitShiftRight = dualImpl({
  name: 'bitShiftRight',
  signature: bitShiftSignature,
  normalImpl: cpuBitShiftRight,
  codegenImpl: (ctx, [lhs, rhs]) => {
    if (isVec(lhs.dataType) && !isVec(rhs.dataType)) {
      const cc = lhs.dataType.componentCount;
      const schema = cc === 2 ? vec2u : cc === 3 ? vec3u : vec4u;
      return ctx.gen.emitBinaryOp(lhs, '>>', ctx.gen.typeInstantiation(schema, [rhs]));
    }
    return ctx.gen.emitBinaryOp(lhs, '>>', rhs);
  },
  sideEffects: false,
});
