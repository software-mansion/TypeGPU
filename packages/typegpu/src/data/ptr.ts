import type { AnyData } from './dataTypes';
import type { Ptr } from './wgslTypes';

export function ptrFn<T extends AnyData>(
  inner: T,
): Ptr<'function', T, 'read-write'> {
  return {
    type: 'ptr',
    inner,
    addressSpace: 'function',
    access: 'read-write',
  } as Ptr<'function', T, 'read-write'>;
}
