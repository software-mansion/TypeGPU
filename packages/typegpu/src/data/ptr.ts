import type { AnyData } from './dataTypes';
import type { Exotic } from './exotic';
import type { PtrFn } from './wgslTypes';

export function ptrFn<T extends AnyData>(inner: AnyData): PtrFn<Exotic<T>> {
  return {
    type: 'ptrFn',
    inner: inner as Exotic<T>,
  } as PtrFn<Exotic<T>>;
}
