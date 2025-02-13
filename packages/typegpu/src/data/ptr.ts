import type { AnyData } from './dataTypes';
import type { PtrFn } from './wgslTypes';

export function ptrFn<T extends AnyData>(inner: T): PtrFn<T> {
  return {
    type: 'ptrFn',
    inner: inner,
  } as PtrFn<T>;
}
