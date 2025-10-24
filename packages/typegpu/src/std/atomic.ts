import { createDualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { i32, u32 } from '../data/numeric.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import {
  type AnyWgslData,
  type atomicI32,
  type atomicU32,
  isWgslData,
  Void,
} from '../data/wgslTypes.ts';
import { safeStringify } from '../shared/stringify.ts';
type AnyAtomic = atomicI32 | atomicU32;

export const workgroupBarrier = createDualImpl(
  // CPU implementation
  () => console.warn('workgroupBarrier is a no-op outside of CODEGEN mode.'),
  // CODEGEN implementation
  () => snip('workgroupBarrier()', Void),
  'workgroupBarrier',
);

export const storageBarrier = createDualImpl(
  // CPU implementation
  () => console.warn('storageBarrier is a no-op outside of CODEGEN mode.'),
  // CODEGEN implementation
  () => snip('storageBarrier()', Void),
  'storageBarrier',
);

export const textureBarrier = createDualImpl(
  // CPU implementation
  () => console.warn('textureBarrier is a no-op outside of CODEGEN mode.'),
  // CODEGEN implementation
  () => snip('textureBarrier()', Void),
  'textureBarrier',
);

export const atomicLoad = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T): number => {
    throw new Error(
      'Atomic operations are not supported outside of CODEGEN mode.',
    );
  },
  // CODEGEN implementation
  (a) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicLoad(&${a})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${safeStringify(a.dataType)}`,
    );
  },
  'atomicLoad',
);

export const atomicStore = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): void => {
    throw new Error(
      'Atomic operations are not supported outside of CODEGEN mode.',
    );
  },
  // CODEGEN implementation
  (a, value) => {
    if (!isWgslData(a.dataType) || a.dataType.type !== 'atomic') {
      throw new Error(
        `Invalid atomic type: ${safeStringify(a.dataType)}`,
      );
    }
    return snip(stitch`atomicStore(&${a}, ${value})`, Void);
  },
  'atomicStore',
);

const atomicTypeFn = (a: Snippet, _value: Snippet): AnyWgslData[] => {
  if (a.dataType.type === 'atomic' && a.dataType.inner.type === 'i32') {
    return [a.dataType, i32];
  }
  return [a.dataType as AnyWgslData, u32];
};

export const atomicAdd = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error(
      'Atomic operations are not supported outside of CODEGEN mode.',
    );
  },
  // CODEGEN implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicAdd(&${a}, ${value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${safeStringify(a.dataType)}`,
    );
  },
  'atomicAdd',
  atomicTypeFn,
);

export const atomicSub = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error(
      'Atomic operations are not supported outside of CODEGEN mode.',
    );
  },
  // CODEGEN implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicSub(&${a}, ${value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${safeStringify(a.dataType)}`,
    );
  },
  'atomicSub',
  atomicTypeFn,
);

export const atomicMax = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error(
      'Atomic operations are not supported outside of CODEGEN mode.',
    );
  },
  // CODEGEN implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicMax(&${a}, ${value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${safeStringify(a.dataType)}`,
    );
  },
  'atomicMax',
  atomicTypeFn,
);

export const atomicMin = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error(
      'Atomic operations are not supported outside of CODEGEN mode.',
    );
  },
  // CODEGEN implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicMin(&${a}, ${value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${safeStringify(a.dataType)}`,
    );
  },
  'atomicMin',
  atomicTypeFn,
);

export const atomicAnd = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error(
      'Atomic operations are not supported outside of CODEGEN mode.',
    );
  },
  // CODEGEN implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicAnd(&${a}, ${value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${safeStringify(a.dataType)}`,
    );
  },
  'atomicAnd',
  atomicTypeFn,
);

export const atomicOr = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error(
      'Atomic operations are not supported outside of CODEGEN mode.',
    );
  },
  // CODEGEN implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicOr(&${a}, ${value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${safeStringify(a.dataType)}`,
    );
  },
  'atomicOr',
  atomicTypeFn,
);

export const atomicXor = createDualImpl(
  // CPU implementation
  <T extends AnyAtomic>(a: T, value: number): number => {
    throw new Error(
      'Atomic operations are not supported outside of CODEGEN mode.',
    );
  },
  // CODEGEN implementation
  (a, value) => {
    if (isWgslData(a.dataType) && a.dataType.type === 'atomic') {
      return snip(stitch`atomicXor(&${a}, ${value})`, a.dataType.inner);
    }
    throw new Error(
      `Invalid atomic type: ${safeStringify(a.dataType)}`,
    );
  },
  'atomicXor',
  atomicTypeFn,
);
