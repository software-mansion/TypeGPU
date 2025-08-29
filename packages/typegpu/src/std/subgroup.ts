import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { bool, i32, u32 } from '../data/numeric.ts';
import { vec4u } from '../data/vector.ts';
import type {
  AnyIntegerVecInstance,
  AnyNumericVecInstance,
  AnyWgslData,
} from '../data/wgslTypes.ts';
import { unify } from '../tgsl/conversion.ts';

function identityNumOrVec(e: number): number;
function identityNumOrVec<T extends AnyNumericVecInstance>(e: T): T;
function identityNumOrVec<T extends number | AnyNumericVecInstance>(
  e: T,
): T {
  throw new Error('subgroup operations can only be used in the GPU context');
}

export function identityIntNumOrVec(e: number): number;
export function identityIntNumOrVec<T extends AnyIntegerVecInstance>(
  e: T,
): T;
export function identityIntNumOrVec<
  T extends number | AnyIntegerVecInstance,
>(
  e: T,
): T {
  throw new Error('subgroup operations can only be used in the GPU context');
}

export function identityNumOrVecWithIdx(
  e: number,
  index: number,
): number;
export function identityNumOrVecWithIdx<
  T extends AnyNumericVecInstance,
>(
  e: T,
  index: number,
): T;
export function identityNumOrVecWithIdx<
  T extends number | AnyNumericVecInstance,
>(
  e: T,
  index: number,
): T {
  throw new Error('subgroup operations can only be used in the GPU context');
}

export function identityNumOrVecWithDelta(
  e: number,
  delta: number,
): number;
export function identityNumOrVecWithDelta<
  T extends AnyNumericVecInstance,
>(
  e: T,
  delta: number,
): T;
export function identityNumOrVecWithDelta<
  T extends number | AnyNumericVecInstance,
>(
  e: T,
  delta: number,
): T {
  throw new Error('subgroup operations can only be used in the GPU context');
}

export function identityNumOrVecWithMask(
  e: number,
  mask: number,
): number;
export function identityNumOrVecWithMask<
  T extends AnyNumericVecInstance,
>(
  e: T,
  mask: number,
): T;
export function identityNumOrVecWithMask<
  T extends number | AnyNumericVecInstance,
>(
  e: T,
  mask: number,
): T {
  throw new Error('subgroup operations can only be used in the GPU context');
}

export const subgroupAdd = dualImpl({
  name: 'subgroupAdd',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: identityNumOrVec,
  codegenImpl: (arg) => stitch`subgroupAdd(${arg})`,
});

export const subgroupExclusiveAdd = dualImpl({
  name: 'subgroupExclusiveAdd',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: identityNumOrVec,
  codegenImpl: (arg) => stitch`subgroupExclusiveAdd(${arg})`,
});

export const subgroupInclusiveAdd = dualImpl({
  name: 'subgroupInclusiveAdd',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: identityNumOrVec,
  codegenImpl: (arg) => stitch`subgroupInclusiveAdd(${arg})`,
});

export const subgroupAll = dualImpl({
  name: 'subgroupAll',
  signature: { argTypes: [bool], returnType: bool },
  normalImpl: (e: boolean) => {
    throw new Error('subgroupAll can only be used in the GPU context');
  },
  codegenImpl: (e) => stitch`subgroupAll(${e})`,
});

export const subgroupAnd = dualImpl({
  name: 'subgroupAnd',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: identityIntNumOrVec,
  codegenImpl: (e) => stitch`subgroupAnd(${e})`,
});

export const subgroupAny = dualImpl({
  name: 'subgroupAny',
  signature: { argTypes: [bool], returnType: bool },
  normalImpl: (e: boolean) => {
    throw new Error('subgroupAny can only be used in the GPU context');
  },
  codegenImpl: (e) => stitch`subgroupAny(${e})`,
});

export const subgroupBallot = dualImpl({
  name: 'subgroupBallot',
  signature: { argTypes: [bool], returnType: vec4u },
  normalImpl: (e: boolean) => {
    throw new Error('subgroupBallot can only be used in the GPU context');
  },
  codegenImpl: (e) => stitch`subgroupBallot(${e})`,
});

export const subgroupBroadcast = dualImpl({
  name: 'subgroupBroadcast',
  signature: (...args) => {
    const id = unify([args[1]] as [AnyWgslData], [i32, u32]);
    if (!id) {
      throw new Error(
        `subgroupBroadcast's second argument has to be compatible with i32 or u32. Got: ${
          args[1].type
        }`,
      );
    }
    return { argTypes: [args[0], id[0]], returnType: args[0] };
  },
  normalImpl: identityNumOrVecWithIdx,
  codegenImpl: (e, index) => stitch`subgroupBroadcast(${e}, ${index})`,
});

export const subgroupBroadcastFirst = dualImpl({
  name: 'subgroupBroadcastFirst',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: identityNumOrVec,
  codegenImpl: (e) => stitch`subgroupBroadcastFirst(${e})`,
});

export const subgroupElect = dualImpl({
  name: 'subgroupElect',
  signature: { argTypes: [], returnType: bool },
  normalImpl: (): boolean => {
    throw new Error('subgroupElect can only be used in the GPU context');
  },
  codegenImpl: () => stitch`subgroupElect()`,
});

export const subgroupMax = dualImpl({
  name: 'subgroupMax',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: identityNumOrVec,
  codegenImpl: (arg) => stitch`subgroupMax(${arg})`,
});

export const subgroupMin = dualImpl({
  name: 'subgroupMin',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: identityNumOrVec,
  codegenImpl: (arg) => stitch`subgroupMin(${arg})`,
});

export const subgroupMul = dualImpl({
  name: 'subgroupMul',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: identityNumOrVec,
  codegenImpl: (arg) => stitch`subgroupMul(${arg})`,
});

export const subgroupExclusiveMul = dualImpl({
  name: 'subgroupExclusiveMul',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: identityNumOrVec,
  codegenImpl: (arg) => stitch`subgroupExclusiveMul(${arg})`,
});

export const subgroupInclusiveMul = dualImpl({
  name: 'subgroupInclusiveMul',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: identityNumOrVec,
  codegenImpl: (arg) => stitch`subgroupInclusiveMul(${arg})`,
});

export const subgroupOr = dualImpl({
  name: 'subgroupOr',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: identityIntNumOrVec,
  codegenImpl: (e) => stitch`subgroupOr(${e})`,
});

export const subgroupShuffle = dualImpl({
  name: 'subgroupShuffle',
  signature: (...args) => {
    const id = unify([args[1]] as [AnyWgslData], [i32, u32]);
    if (!id) {
      throw new Error(
        `subgroupShuffle's second argument has to be compatible with i32 or u32. Got: ${
          args[1].type
        }`,
      );
    }
    return { argTypes: [args[0], id[0]], returnType: args[0] };
  },
  normalImpl: identityNumOrVecWithIdx,
  codegenImpl: (e, index) => stitch`subgroupShuffle(${e}, ${index})`,
});

export const subgroupShuffleDown = dualImpl({
  name: 'subgroupShuffleDown',
  signature: (...args) => {
    const delta = unify([args[1]] as [AnyWgslData], [u32]);
    if (!delta) {
      throw new Error(
        `subgroupShuffleDown's second argument has to be compatible with u32. Got: ${
          args[1].type
        }`,
      );
    }
    return { argTypes: [args[0], delta[0]], returnType: args[0] };
  },
  normalImpl: identityNumOrVecWithDelta,
  codegenImpl: (e, delta) => stitch`subgroupShuffleDown(${e}, ${delta})`,
});

export const subgroupShuffleUp = dualImpl({
  name: 'subgroupShuffleUp',
  signature: (...args) => {
    const delta = unify([args[1]] as [AnyWgslData], [u32]);
    if (!delta) {
      throw new Error(
        `subgroupShuffleUp's second argument has to be compatible with u32. Got: ${
          args[1].type
        }`,
      );
    }
    return { argTypes: [args[0], delta[0]], returnType: args[0] };
  },
  normalImpl: identityNumOrVecWithDelta,
  codegenImpl: (e, delta) => stitch`subgroupShuffleUp(${e}, ${delta})`,
});

export const subgroupShuffleXor = dualImpl({
  name: 'subgroupShuffleXor',
  signature: (...args) => {
    const mask = unify([args[1]] as [AnyWgslData], [u32]);
    if (!mask) {
      throw new Error(
        `subgroupShuffleXor's second argument has to be compatible with u32. Got: ${
          args[1].type
        }`,
      );
    }
    return { argTypes: [args[0], mask[0]], returnType: args[0] };
  },
  normalImpl: identityNumOrVecWithMask,
  codegenImpl: (e, mask) => stitch`subgroupShuffleXor(${e}, ${mask})`,
});

export const subgroupXor = dualImpl({
  name: 'subgroupXor',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: identityIntNumOrVec,
  codegenImpl: (e) => stitch`subgroupXor(${e})`,
});
