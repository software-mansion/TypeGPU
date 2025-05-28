import { snip, type Snippet } from '../data/dataTypes.ts';
import { i32, u32 } from '../data/numeric.ts';
import {
  type AnyWgslData,
  type atomicI32,
  type atomicU32,
  isWgslData,
  Void,
} from '../data/wgslTypes.ts';
import { createDualImpl } from '../shared/generators.ts';
import { setName } from '../shared/meta.ts';
type AnyAtomic = atomicI32 | atomicU32;

export const workgroupBarrier = createDualImpl(
  // CPU implementation
  () => console.warn('workgroupBarrier is a no-op outside of GPU mode.'),
  // GPU implementation
  () => snip('workgroupBarrier()', Void),
);
setName(workgroupBarrier, 'workgroupBarrier');

export const storageBarrier = createDualImpl(
  // CPU implementation
  () => console.warn('storageBarrier is a no-op outside of GPU mode.'),
  // GPU implementation
  () => snip('storageBarrier()', Void),
);
setName(storageBarrier, 'storageBarrier');

export const textureBarrier = createDualImpl(
  // CPU implementation
  () => console.warn('textureBarrier is a no-op outside of GPU mode.'),
  // GPU implementation
  () => snip('textureBarrier()', Void),
);
setName(textureBarrier, 'textureBarrier');

export const atomicLoad = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(`atomicLoad(&${a.value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
);
setName(atomicLoad, 'atomicLoad');

export const atomicStore = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): void => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (!isWgslData(a.dataType) || a.dataType.type !== 'atomic') {
      throw new Error(
        `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
      );
    }
    return snip(`atomicStore(&${a.value}, ${value.value})`, Void);
  },
);
setName(atomicStore, 'atomicStore');

const atomicTypeFn = (a: Snippet, _value: Snippet): AnyWgslData[] => {
  if (a.dataType.type === 'atomic' && a.dataType.inner.type === 'i32') {
    return [a.dataType, i32];
  }
  return [a.dataType as AnyWgslData, u32];
};
setName(atomicTypeFn, 'atomicTypeFn');

export const atomicAdd = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(`atomicAdd(&${a.value}, ${value.value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
  atomicTypeFn,
);
setName(atomicAdd, 'atomicAdd');

export const atomicSub = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(`atomicSub(&${a.value}, ${value.value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
  atomicTypeFn,
);
setName(atomicSub, 'atomicSub');

export const atomicMax = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(`atomicMax(&${a.value}, ${value.value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
  atomicTypeFn,
);
setName(atomicMax, 'atomicMax');

export const atomicMin = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(`atomicMin(&${a.value}, ${value.value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
  atomicTypeFn,
);
setName(atomicMin, 'atomicMin');

export const atomicAnd = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(`atomicAnd(&${a.value}, ${value.value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
  atomicTypeFn,
);
setName(atomicAnd, 'atomicAnd');

export const atomicOr = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(`atomicOr(&${a.value}, ${value.value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
  atomicTypeFn,
);
setName(atomicOr, 'atomicOr');

export const atomicXor = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(`atomicXor(&${a.value}, ${value.value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${JSON.stringify(a.dataType, null, 2)}`,
    );
  },
  atomicTypeFn,
);
setName(atomicXor, 'atomicXor');
