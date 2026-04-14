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
import { DualFn } from '../types.ts';
type AnyAtomic = atomicI32 | atomicU32;

export const workgroupBarrier: DualFn<() => void> = dualImpl({
  name: 'workgroupBarrier',
  normalImpl: 'workgroupBarrier is a no-op outside of CODEGEN mode.',
  signature: { argTypes: [], returnType: Void },
  codegenImpl: () => 'workgroupBarrier()',
});

export const storageBarrier: DualFn<() => void> = dualImpl({
  name: 'storageBarrier',
  normalImpl: 'storageBarrier is a no-op outside of CODEGEN mode.',
  signature: { argTypes: [], returnType: Void },
  codegenImpl: () => 'storageBarrier()',
});

export const textureBarrier: DualFn<() => void> = dualImpl({
  name: 'textureBarrier',
  normalImpl: 'textureBarrier is a no-op outside of CODEGEN mode.',
  signature: { argTypes: [], returnType: Void },
  codegenImpl: () => 'textureBarrier()',
});

const atomicNormalError = 'Atomic operations are not supported outside of CODEGEN mode.';

type AtomicLoad = <T extends AnyAtomic>(a: T) => number;

export const atomicLoad: DualFn<AtomicLoad> = dualImpl<AtomicLoad>({
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

type AtomicStore = <T extends AnyAtomic>(a: T, value: number) => void;

export const atomicStore: DualFn<AtomicStore> = dualImpl<AtomicStore>({
  name: 'atomicStore',
  normalImpl: atomicNormalError,
  signature: atomicActionSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicStore(&${a}, ${value})`,
});

type AtomicAdd = <T extends AnyAtomic>(a: T, value: number) => number;

export const atomicAdd: DualFn<AtomicAdd> = dualImpl<AtomicAdd>({
  name: 'atomicAdd',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicAdd(&${a}, ${value})`,
});

type AtomicSub = <T extends AnyAtomic>(a: T, value: number) => number;

export const atomicSub: DualFn<AtomicSub> = dualImpl<AtomicSub>({
  name: 'atomicSub',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicSub(&${a}, ${value})`,
});

type AtomicMax = <T extends AnyAtomic>(a: T, value: number) => number;

export const atomicMax: DualFn<AtomicMax> = dualImpl<AtomicMax>({
  name: 'atomicMax',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicMax(&${a}, ${value})`,
});

type AtomicMin = <T extends AnyAtomic>(a: T, value: number) => number;

export const atomicMin: DualFn<AtomicMin> = dualImpl<AtomicMin>({
  name: 'atomicMin',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicMin(&${a}, ${value})`,
});

type AtomicAnd = <T extends AnyAtomic>(a: T, value: number) => number;

export const atomicAnd: DualFn<AtomicAnd> = dualImpl<AtomicAnd>({
  name: 'atomicAnd',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicAnd(&${a}, ${value})`,
});

type AtomicOr = <T extends AnyAtomic>(a: T, value: number) => number;

export const atomicOr: DualFn<AtomicOr> = dualImpl<AtomicOr>({
  name: 'atomicOr',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicOr(&${a}, ${value})`,
});

type AtomicXor = <T extends AnyAtomic>(a: T, value: number) => number;

export const atomicXor: DualFn<AtomicXor> = dualImpl<AtomicXor>({
  name: 'atomicXor',
  normalImpl: atomicNormalError,
  signature: atomicOpSignature,
  codegenImpl: (_ctx, [a, value]) => stitch`atomicXor(&${a}, ${value})`,
});
