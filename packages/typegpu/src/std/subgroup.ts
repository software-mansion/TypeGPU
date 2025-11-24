import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { bool, i32, u32 } from '../data/numeric.ts';
import { vec4u } from '../data/vector.ts';
import type {
  AnyIntegerVecInstance,
  AnyNumericVecInstance,
  AnyWgslData,
  v4u,
} from '../data/wgslTypes.ts';
import { unify } from '../tgsl/conversion.ts';

interface IdentityNumOrVec {
  (e: number): number;
  <T extends AnyNumericVecInstance>(e: T): T;
}

interface IdentityIntNumOrVec {
  (e: number): number;
  <T extends AnyIntegerVecInstance>(e: T): T;
}

interface IdentityNumOrVecWithIdx {
  (e: number, index: number): number;
  <T extends AnyNumericVecInstance>(e: T, index: number): T;
}

interface IdentityNumOrVecWithDelta {
  (e: number, delta: number): number;
  <T extends AnyNumericVecInstance>(e: T, delta: number): T;
}

interface IdentityNumOrVecWithMask {
  (e: number, mask: number): number;
  <T extends AnyNumericVecInstance>(e: T, mask: number): T;
}

const errorMessage = 'Subgroup operations can only be used in the GPU context.';

export const subgroupAdd = dualImpl<IdentityNumOrVec>({
  name: 'subgroupAdd',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (arg) => stitch`subgroupAdd(${arg})`,
});

export const subgroupExclusiveAdd = dualImpl<IdentityNumOrVec>({
  name: 'subgroupExclusiveAdd',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (arg) => stitch`subgroupExclusiveAdd(${arg})`,
});

export const subgroupInclusiveAdd = dualImpl<IdentityNumOrVec>({
  name: 'subgroupInclusiveAdd',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (arg) => stitch`subgroupInclusiveAdd(${arg})`,
});

export const subgroupAll = dualImpl<(e: boolean) => boolean>({
  name: 'subgroupAll',
  signature: { argTypes: [bool], returnType: bool },
  normalImpl: errorMessage,
  codegenImpl: (e) => stitch`subgroupAll(${e})`,
});

export const subgroupAnd = dualImpl<IdentityIntNumOrVec>({
  name: 'subgroupAnd',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (e) => stitch`subgroupAnd(${e})`,
});

export const subgroupAny = dualImpl<(e: boolean) => boolean>({
  name: 'subgroupAny',
  signature: { argTypes: [bool], returnType: bool },
  normalImpl: errorMessage,
  codegenImpl: (e) => stitch`subgroupAny(${e})`,
});

export const subgroupBallot = dualImpl<(e: boolean) => v4u>({
  name: 'subgroupBallot',
  signature: { argTypes: [bool], returnType: vec4u },
  normalImpl: errorMessage,
  codegenImpl: (e) => stitch`subgroupBallot(${e})`,
});

export const subgroupBroadcast = dualImpl<IdentityNumOrVecWithIdx>({
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
  normalImpl: errorMessage,
  codegenImpl: (e, index) => stitch`subgroupBroadcast(${e}, ${index})`,
});

export const subgroupBroadcastFirst = dualImpl<IdentityNumOrVec>({
  name: 'subgroupBroadcastFirst',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (e) => stitch`subgroupBroadcastFirst(${e})`,
});

export const subgroupElect = dualImpl<() => boolean>({
  name: 'subgroupElect',
  signature: { argTypes: [], returnType: bool },
  normalImpl: errorMessage,
  codegenImpl: () => stitch`subgroupElect()`,
});

export const subgroupMax = dualImpl<IdentityNumOrVec>({
  name: 'subgroupMax',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (arg) => stitch`subgroupMax(${arg})`,
});

export const subgroupMin = dualImpl<IdentityNumOrVec>({
  name: 'subgroupMin',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (arg) => stitch`subgroupMin(${arg})`,
});

export const subgroupMul = dualImpl<IdentityNumOrVec>({
  name: 'subgroupMul',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (arg) => stitch`subgroupMul(${arg})`,
});

export const subgroupExclusiveMul = dualImpl<IdentityNumOrVec>({
  name: 'subgroupExclusiveMul',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (arg) => stitch`subgroupExclusiveMul(${arg})`,
});

export const subgroupInclusiveMul = dualImpl<IdentityNumOrVec>({
  name: 'subgroupInclusiveMul',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (arg) => stitch`subgroupInclusiveMul(${arg})`,
});

export const subgroupOr = dualImpl<IdentityIntNumOrVec>({
  name: 'subgroupOr',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (e) => stitch`subgroupOr(${e})`,
});

export const subgroupShuffle = dualImpl<IdentityNumOrVecWithIdx>({
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
  normalImpl: errorMessage,
  codegenImpl: (e, index) => stitch`subgroupShuffle(${e}, ${index})`,
});

export const subgroupShuffleDown = dualImpl<IdentityNumOrVecWithDelta>({
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
  normalImpl: errorMessage,
  codegenImpl: (e, delta) => stitch`subgroupShuffleDown(${e}, ${delta})`,
});

export const subgroupShuffleUp = dualImpl<IdentityNumOrVecWithDelta>({
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
  normalImpl: errorMessage,
  codegenImpl: (e, delta) => stitch`subgroupShuffleUp(${e}, ${delta})`,
});

export const subgroupShuffleXor = dualImpl<IdentityNumOrVecWithMask>({
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
  normalImpl: errorMessage,
  codegenImpl: (e, mask) => stitch`subgroupShuffleXor(${e}, ${mask})`,
});

export const subgroupXor = dualImpl<IdentityIntNumOrVec>({
  name: 'subgroupXor',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: (e) => stitch`subgroupXor(${e})`,
});
