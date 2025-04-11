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

export function ptrPrivate<T extends AnyData>(
  inner: T,
): Ptr<'private', T, 'read-write'> {
  return {
    type: 'ptr',
    inner,
    addressSpace: 'private',
    access: 'read-write',
  } as Ptr<'private', T, 'read-write'>;
}

export function ptrWorkgroup<T extends AnyData>(
  inner: T,
): Ptr<'workgroup', T, 'read-write'> {
  return {
    type: 'ptr',
    inner,
    addressSpace: 'workgroup',
    access: 'read-write',
  } as Ptr<'workgroup', T, 'read-write'>;
}

export function ptrStorage<
  T extends AnyData,
  TAccess extends 'read' | 'read-write' = 'read',
>(inner: T, access: TAccess = 'read' as TAccess): Ptr<'storage', T, TAccess> {
  return {
    type: 'ptr',
    inner,
    addressSpace: 'storage',
    access,
  } as Ptr<'storage', T, TAccess>;
}

export function ptrUniform<T extends AnyData>(
  inner: T,
): Ptr<'uniform', T, 'read'> {
  return {
    type: 'ptr',
    inner,
    addressSpace: 'uniform',
    access: 'read',
  } as Ptr<'uniform', T, 'read'>;
}

export function ptrHandle<T extends AnyData>(
  inner: T,
): Ptr<'handle', T, 'read'> {
  return {
    type: 'ptr',
    inner,
    addressSpace: 'handle',
    access: 'read',
  } as Ptr<'handle', T, 'read'>;
}
