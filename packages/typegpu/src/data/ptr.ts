import { $internal } from '../shared/symbols.ts';
import { type Origin, type OriginToPtrParams, originToPtrParams } from './snippet.ts';
import type { Access, AddressSpace, BaseData, Ptr, StorableData } from './wgslTypes.ts';

export function ptrFn<T extends StorableData>(inner: T): Ptr<'function', T, 'read-write'> {
  return INTERNAL_createPtr('function', inner, 'read-write');
}

export function ptrPrivate<T extends StorableData>(inner: T): Ptr<'private', T, 'read-write'> {
  return INTERNAL_createPtr('private', inner, 'read-write');
}

export function ptrWorkgroup<T extends StorableData>(inner: T): Ptr<'workgroup', T, 'read-write'> {
  return INTERNAL_createPtr('workgroup', inner, 'read-write');
}

export function ptrStorage<T extends StorableData, TAccess extends 'read' | 'read-write' = 'read'>(
  inner: T,
  access: TAccess = 'read' as TAccess,
): Ptr<'storage', T, TAccess> {
  return INTERNAL_createPtr('storage', inner, access);
}

export function ptrUniform<T extends StorableData>(inner: T): Ptr<'uniform', T, 'read'> {
  return INTERNAL_createPtr('uniform', inner, 'read');
}

export function ptrHandle<T extends StorableData>(inner: T): Ptr<'handle', T, 'read'> {
  return INTERNAL_createPtr('handle', inner, 'read');
}

export function INTERNAL_createPtr<
  TAddressSpace extends AddressSpace,
  TInner extends BaseData,
  TAccess extends Access,
>(
  addressSpace: TAddressSpace,
  inner: TInner,
  access: TAccess,
  implicit: boolean = false,
): Ptr<TAddressSpace, TInner, TAccess> {
  return {
    [$internal]: {},
    type: 'ptr',
    addressSpace,
    inner,
    access,
    implicit,
    toString: () => `ptr<${addressSpace}, ${inner}, ${access}>`,
  } as Ptr<TAddressSpace, TInner, TAccess>;
}

export function createPtrFromOrigin(origin: Origin, innerDataType: StorableData): Ptr | undefined {
  const ptrParams = originToPtrParams[origin as keyof OriginToPtrParams];

  if (ptrParams) {
    return INTERNAL_createPtr(ptrParams.space, innerDataType, ptrParams.access);
  }

  return undefined;
}

export function implicitFrom(ptr: Ptr): Ptr {
  return INTERNAL_createPtr(ptr.addressSpace, ptr.inner, ptr.access, /* implicit */ true);
}

export function explicitFrom(ptr: Ptr): Ptr {
  return INTERNAL_createPtr(ptr.addressSpace, ptr.inner, ptr.access, /* implicit */ false);
}
