import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { bool, i32, u32 } from '../data/numeric.ts';
import { abstruct } from '../data/struct.ts';
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
  sideEffects: true,
});

export const storageBarrier = dualImpl({
  name: 'storageBarrier',
  normalImpl: 'storageBarrier is a no-op outside of CODEGEN mode.',
  signature: { argTypes: [], returnType: Void },
  codegenImpl: () => 'storageBarrier()',
  sideEffects: true,
});

export const textureBarrier = dualImpl({
  name: 'textureBarrier',
  normalImpl: 'textureBarrier is a no-op outside of CODEGEN mode.',
  signature: { argTypes: [], returnType: Void },
  codegenImpl: () => 'textureBarrier()',
  sideEffects: true,
});

interface WorkgroupUniformLoad {
  <T extends AnyAtomic>(value: T): number;
  <T>(value: T): T;
}

export const workgroupUniformLoad = dualImpl<WorkgroupUniformLoad>({
  name: 'workgroupUniformLoad',
  normalImpl: 'workgroupUniformLoad is not supported outside of CODEGEN mode.',
  signature: (value: BaseData) => ({
    argTypes: [value],
    returnType: isAtomic(value) ? value.inner : value,
  }),
  codegenImpl: (_ctx, [value]) => stitch`workgroupUniformLoad(&${value})`,
  sideEffects: true,
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
  sideEffects: true,
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
  sideEffects: true,
});

export const atomicAdd = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicAdd',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicAdd(&${a}, ${value})`,
  sideEffects: true,
});

export const atomicSub = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicSub',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicSub(&${a}, ${value})`,
  sideEffects: true,
});

export const atomicMax = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicMax',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicMax(&${a}, ${value})`,
  sideEffects: true,
});

export const atomicMin = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicMin',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicMin(&${a}, ${value})`,
  sideEffects: true,
});

export const atomicAnd = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicAnd',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicAnd(&${a}, ${value})`,
  sideEffects: true,
});

export const atomicOr = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicOr',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicOr(&${a}, ${value})`,
  sideEffects: true,
});

export const atomicXor = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicXor',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicXor(&${a}, ${value})`,
  sideEffects: true,
});

export const atomicExchange = dualImpl<<T extends AnyAtomic>(a: T, value: number) => number>({
  name: 'atomicExchange',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicExchange(&${a}, ${value})`,
  sideEffects: true,
});

const AtomicCompareExchangeResults = {
  i32: abstruct({ old_value: i32, exchanged: bool }),
  u32: abstruct({ old_value: u32, exchanged: bool }),
} as const;

type AtomicCompareExchangeResult = {
  old_value: number;
  exchanged: boolean;
};

export const atomicCompareExchangeWeak = dualImpl<
  <T extends AnyAtomic>(a: T, compare: number, value: number) => AtomicCompareExchangeResult
>({
  name: 'atomicCompareExchangeWeak',
  normalImpl: atomicNormalError,
  signature: (a) => {
    if (!isAtomic(a)) {
      throw new Error(`Invalid atomic type: ${safeStringify(a)}`);
    }
    const inner = a.inner.type === 'u32' ? u32 : i32;
    return {
      argTypes: [a, inner, inner],
      returnType: AtomicCompareExchangeResults[inner.type],
    };
  },
  codegenImpl: (_ctx, [a, compare, value]) =>
    stitch`atomicCompareExchangeWeak(&${a}, ${compare}, ${value})`,
  sideEffects: true,
});
