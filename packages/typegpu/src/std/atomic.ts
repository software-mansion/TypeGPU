import { stitch } from '../core/resolve/stitch.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import { i32, u32 } from '../data/numeric.ts';
import {
  type AnyWgslData,
  type atomicI32,
  type atomicU32,
  isWgslData,
  Void,
} from '../data/wgslTypes.ts';
import { createDualImpl } from '../core/function/dualImpl.ts';
type AnyAtomic = atomicI32 | atomicU32;

export const workgroupBarrier = createDualImpl({
  name: 'workgroupBarrier',
  normalImpl: 'workgroupBarrier is a no-op outside of CODEGEN mode.',
  codegenImpl: () => snip('workgroupBarrier()', Void),
});

export const storageBarrier = createDualImpl({
  name: 'storageBarrier',
  normalImpl: 'storageBarrier is a no-op outside of CODEGEN mode.',
  codegenImpl: () => snip('storageBarrier()', Void),
});

export const textureBarrier = createDualImpl({
  name: 'textureBarrier',
  normalImpl: 'textureBarrier is a no-op outside of CODEGEN mode.',
  codegenImpl: () => snip('textureBarrier()', Void),
});

export const atomicLoad = createDualImpl<<T extends AnyAtomic>(a: T) => number>(
  {
    name: 'atomicLoad',
    normalImpl: 'Atomic operations are not supported outside of CODEGEN mode.',
    codegenImpl: (a) => {
      if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
        return snip(stitch`atomicLoad(&${a})`, a.dataType.inner);
      }
      throw new Error(
        `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
      );
    },
  },
);

export const atomicStore = createDualImpl<
  <T extends AnyAtomic>(a: T, value: number) => void
>({
  name: 'atomicStore',
  normalImpl: 'Atomic operations are not supported outside of CODEGEN mode.',
  codegenImpl: (a, value) => {
    if (!isWgslData(a.dataType) || a.dataType.type !== 'atomic') {
      throw new Error(
        `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
      );
    }
    return snip(stitch`atomicStore(&${a}, ${value})`, Void);
  },
});

const atomicTypeFn = (a: Snippet, _value: Snippet): AnyWgslData[] => {
  if (a.dataType.type === 'atomic' && a.dataType.inner.type === 'i32') {
    return [a.dataType, i32];
  }
  return [a.dataType as AnyWgslData, u32];
};

export const atomicAdd = createDualImpl<
  <T extends AnyAtomic>(a: T, value: number) => number
>({
  name: 'atomicAdd',
  normalImpl: 'Atomic operations are not supported outside of CODEGEN mode.',
  codegenImpl: (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicAdd(&${a}, ${value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
  args: atomicTypeFn,
});

export const atomicSub = createDualImpl<
  <T extends AnyAtomic>(a: T, value: number) => number
>({
  name: 'atomicSub',
  normalImpl: 'Atomic operations are not supported outside of CODEGEN mode.',
  codegenImpl: (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicSub(&${a}, ${value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
  args: atomicTypeFn,
});

export const atomicMax = createDualImpl<
  <T extends AnyAtomic>(a: T, value: number) => number
>({
  name: 'atomicMax',
  normalImpl: 'Atomic operations are not supported outside of CODEGEN mode.',
  codegenImpl: (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicMax(&${a}, ${value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
  args: atomicTypeFn,
});

export const atomicMin = createDualImpl<
  <T extends AnyAtomic>(a: T, value: number) => number
>({
  name: 'atomicMin',
  normalImpl: 'Atomic operations are not supported outside of CODEGEN mode.',
  codegenImpl: (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicMin(&${a}, ${value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
  args: atomicTypeFn,
});

export const atomicAnd = createDualImpl<
  <T extends AnyAtomic>(a: T, value: number) => number
>({
  name: 'atomicAnd',
  normalImpl: 'Atomic operations are not supported outside of CODEGEN mode.',
  codegenImpl: (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicAnd(&${a}, ${value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
  args: atomicTypeFn,
});

export const atomicOr = createDualImpl<
  <T extends AnyAtomic>(a: T, value: number) => number
>({
  name: 'atomicOr',
  normalImpl: 'Atomic operations are not supported outside of CODEGEN mode.',
  codegenImpl: (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicOr(&${a}, ${value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
  args: atomicTypeFn,
});

export const atomicXor = createDualImpl<
  <T extends AnyAtomic>(a: T, value: number) => number
>({
  name: 'atomicXor',
  normalImpl: 'Atomic operations are not supported outside of CODEGEN mode.',
  codegenImpl: (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicXor(&${a}, ${value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
  args: atomicTypeFn,
});
