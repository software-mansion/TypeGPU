import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { i32, u32 } from '../data/numeric.ts';
import {
  type atomicI32,
  type atomicU32,
  type BaseData,
  isAtomic,
  Void,
} from '../data/wgslTypes.ts';
import { safeStringify } from '../shared/stringify.ts';
type AnyAtomic = atomicI32 | atomicU32;

export const workgroupBarrier = dualImpl({
  name: 'workgroupBarrier',
  normalImpl: 'workgroupBarrier is a no-op outside of CODEGEN mode.',
  signature: { argTypes: [], returnType: Void },
  codegenImpl: () => 'workgroupBarrier()',
});

export const storageBarrier = dualImpl({
  name: 'storageBarrier',
  normalImpl: 'storageBarrier is a no-op outside of CODEGEN mode.',
  signature: { argTypes: [], returnType: Void },
  codegenImpl: () => 'storageBarrier()',
});

export const textureBarrier = dualImpl({
  name: 'textureBarrier',
  normalImpl: 'textureBarrier is a no-op outside of CODEGEN mode.',
  signature: { argTypes: [], returnType: Void },
  codegenImpl: () => 'textureBarrier()',
});

const atomicNormalError = 'Atomic operations are not supported outside of CODEGEN mode.';

export const atomicLoad = dualImpl<<T extends AnyAtomic>(a: T) => number>({
  name: 'atomicLoad',
  normalImpl: atomicNormalError,
  signature: (a) => {
    if (!isAtomic(a)) {
      throw new Error(`Invalid atomic type: ${safeStringify(a)}`);
    }
    return { argTypes: [a], returnType: a.inner };
  },
  codegenImpl: (_ctx, [a]) => stitch`atomicLoad(&${a})`,
});

const atomicActionSignature = (a: BaseData) => {
  if (!isAtomic(a)) {
    throw new Error(`Invalid atomic type: ${safeStringify(a)}`);
  }
  return {
    argTypes: [a, a.inner.type === 'u32' ? u32 : i32],
    returnType: Void,
  };
};

const atomicOpSignature = (a: BaseData) => {
  if (!isAtomic(a)) {
    throw new Error(`Invalid atomic type: ${safeStringify(a)}`);
  }
  const paramType = a.inner.type === 'u32' ? u32 : i32;
  return {
    argTypes: [a, paramType],
    returnType: paramType,
  };
};

export const atomicStore = dualImpl<<T extends AnyAtomic>(a: T, value: number) => void>({
  name: 'atomicStore',
  normalImpl: atomicNormalError,
  signature: atomicActionSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicStore(&${a}, ${value})`,
});

export const atomicAdd = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicAdd',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicAdd(&${a}, ${value})`,
});

export const atomicSub = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicSub',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicSub(&${a}, ${value})`,
});

export const atomicMax = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicMax',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicMax(&${a}, ${value})`,
});

export const atomicMin = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicMin',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicMin(&${a}, ${value})`,
});

export const atomicAnd = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicAnd',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicAnd(&${a}, ${value})`,
});

export const atomicOr = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicOr',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicOr(&${a}, ${value})`,
});

export const atomicXor = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicXor',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicXor(&${a}, ${value})`,
});
