import type { Atomic } from '../data/wgslTypes';
import { inGPUMode } from '../gpuMode';

export function atomicLoad<T extends Atomic>(a: T): number {
  if (inGPUMode()) {
    return `atomicLoad(&${a})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicStore<T extends Atomic>(a: T, value: number): void {
  if (inGPUMode()) {
    // biome-ignore lint/correctness/noVoidTypeReturn: <it is what it is>
    // biome-ignore lint/suspicious/noConfusingVoidType: <it is what it is>
    return `atomicStore(&${a}, ${value})` as unknown as void;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicAdd<T extends Atomic>(a: T, value: number): number {
  if (inGPUMode()) {
    return `atomicAdd(&${a}, ${value})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicSub<T extends Atomic>(a: T, value: number): number {
  if (inGPUMode()) {
    return `atomicSub(&${a}, ${value})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicMax<T extends Atomic>(a: T, value: number): number {
  if (inGPUMode()) {
    return `atomicMax(&${a}, ${value})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicMin<T extends Atomic>(a: T, value: number): number {
  if (inGPUMode()) {
    return `atomicMin(&${a}, ${value})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicAnd<T extends Atomic>(a: T, value: number): number {
  if (inGPUMode()) {
    return `atomicAnd(&${a}, ${value})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicOr<T extends Atomic>(a: T, value: number): number {
  if (inGPUMode()) {
    return `atomicOr(&${a}, ${value})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}

export function atomicXor<T extends Atomic>(a: T, value: number): number {
  if (inGPUMode()) {
    return `atomicXor(&${a}, ${value})` as unknown as number;
  }
  throw new Error('Atomic operations are not supported outside of GPU mode.');
}
