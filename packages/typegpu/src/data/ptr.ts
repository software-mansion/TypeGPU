import { $internal } from '../shared/symbols.ts';
import type { Access, AddressSpace, Ptr, StorableData } from './wgslTypes.ts';

export function ptrFn<T extends StorableData>(
  inner: T,
): Ptr<'function', T, 'read-write'> {
  return INTERNAL_createPtr('function', inner, 'read-write');
}

export function ptrPrivate<T extends StorableData>(
  inner: T,
): Ptr<'private', T, 'read-write'> {
  return INTERNAL_createPtr('private', inner, 'read-write');
}

export function ptrWorkgroup<T extends StorableData>(
  inner: T,
): Ptr<'workgroup', T, 'read-write'> {
  return INTERNAL_createPtr('workgroup', inner, 'read-write');
}

export function ptrStorage<
  T extends StorableData,
  TAccess extends 'read' | 'read-write' = 'read',
>(inner: T, access: TAccess = 'read' as TAccess): Ptr<'storage', T, TAccess> {
  return INTERNAL_createPtr('storage', inner, access);
}

export function ptrUniform<T extends StorableData>(
  inner: T,
): Ptr<'uniform', T, 'read'> {
  return INTERNAL_createPtr('uniform', inner, 'read');
}

export function ptrHandle<T extends StorableData>(
  inner: T,
): Ptr<'handle', T, 'read'> {
  return INTERNAL_createPtr('handle', inner, 'read');
}

function INTERNAL_createPtr<
  TAddressSpace extends AddressSpace,
  TInner extends StorableData,
  TAccess extends Access,
>(
  addressSpace: TAddressSpace,
  inner: TInner,
  access: TAccess,
): Ptr<TAddressSpace, TInner, TAccess> {
  return {
    [$internal]: true,
    type: 'ptr',
    addressSpace,
    inner,
    access,
  } as Ptr<TAddressSpace, TInner, TAccess>;
}
