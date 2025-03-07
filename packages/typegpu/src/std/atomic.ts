import { type atomicI32, type atomicU32, isWgslData } from '../data/wgslTypes';
import { createDualImpl } from '../shared/generators';
import { Void } from '../types';

type AnyAtomic = atomicI32 | atomicU32;

export const workgroupBarrier = createDualImpl(
  // CPU implementation
  () => console.warn('workgroupBarrier is a no-op outside of GPU mode.'),
  // GPU implementation
  () => ({ value: 'workgroupBarrier()', dataType: Void }),
);

export const storageBarrier = createDualImpl(
  // CPU implementation
  () => console.warn('storageBarrier is a no-op outside of GPU mode.'),
  // GPU implementation
  () => ({ value: 'storageBarrier()', dataType: Void }),
);

export const textureBarrier = createDualImpl(
  // CPU implementation
  () => console.warn('textureBarrier is a no-op outside of GPU mode.'),
  // GPU implementation
  () => ({ value: 'textureBarrier()', dataType: Void }),
);

export const atomicLoad = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return { value: `atomicLoad(&${a.value})`, dataType: a.dataType.inner };
    }
    throw new Error(`Invalid atomic type: ${a.dataType}`);
  },
);

export const atomicStore = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): void => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    return {
      value: `atomicStore(&${a.value}, ${value.value})`,
      dataType: Void,
    };
  },
);

export const atomicAdd = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return {
        value: `atomicAdd(&${a.value}, ${value.value})`,
        dataType: a.dataType.inner,
      };
    }
    throw new Error('Invalid atomic type');
  },
);

export const atomicSub = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return {
        value: `atomicSub(&${a.value}, ${value.value})`,
        dataType: a.dataType.inner,
      };
    }
    throw new Error('Invalid atomic type');
  },
);

export const atomicMax = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return {
        value: `atomicMax(&${a.value}, ${value.value})`,
        dataType: a.dataType.inner,
      };
    }
    throw new Error('Invalid atomic type');
  },
);

export const atomicMin = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return {
        value: `atomicMin(&${a.value}, ${value.value})`,
        dataType: a.dataType.inner,
      };
    }
    throw new Error('Invalid atomic type');
  },
);

export const atomicAnd = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return {
        value: `atomicAnd(&${a.value}, ${value.value})`,
        dataType: a.dataType.inner,
      };
    }
    throw new Error('Invalid atomic type');
  },
);

export const atomicOr = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return {
        value: `atomicOr(&${a.value}, ${value.value})`,
        dataType: a.dataType.inner,
      };
    }
    throw new Error('Invalid atomic type');
  },
);

export const atomicXor = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error('Atomic operations are not supported outside of GPU mode.');
  },
  // GPU implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return {
        value: `atomicXor(&${a.value}, ${value.value})`,
        dataType: a.dataType.inner,
      };
    }
    throw new Error('Invalid atomic type');
  },
);
