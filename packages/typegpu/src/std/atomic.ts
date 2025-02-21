import type { atomicI32, atomicU32 } from '../data/wgslTypes';
import { inGPUMode } from '../gpuMode';

type AnyAtomic = atomicI32 | atomicU32;

export function atomicLoad<T extends AnyAtomic>(a: T): number {
  if (inGPUMode()) {
    return `atomicLoad(&${a})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicStore<T extends AnyAtomic>(a: T, value: number): void {
  if (inGPUMode()) {
    // biome-ignore lint/correctness/noVoidTypeReturn:
    // biome-ignore lint/suspicious/noConfusingVoidType:
    return `atomicStore(&${a}, ${value})` as unknown as void;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicAdd<T extends AnyAtomic>(a: T, value: number): number {
  if (inGPUMode()) {
    return `atomicAdd(&${a}, ${value})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicSub<T extends AnyAtomic>(a: T, value: number): number {
  if (inGPUMode()) {
    return `atomicSub(&${a}, ${value})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicMax<T extends AnyAtomic>(a: T, value: number): number {
  if (inGPUMode()) {
    return `atomicMax(&${a}, ${value})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicMin<T extends AnyAtomic>(a: T, value: number): number {
  if (inGPUMode()) {
    return `atomicMin(&${a}, ${value})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicAnd<T extends AnyAtomic>(a: T, value: number): number {
  if (inGPUMode()) {
    return `atomicAnd(&${a}, ${value})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicOr<T extends AnyAtomic>(a: T, value: number): number {
  if (inGPUMode()) {
    return `atomicOr(&${a}, ${value})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicXor<T extends AnyAtomic>(a: T, value: number): number {
  if (inGPUMode()) {
    return `atomicXor(&${a}, ${value})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}
