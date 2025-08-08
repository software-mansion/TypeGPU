import { $internal } from '../shared/symbols.ts';
import type { AnyData } from './dataTypes.ts';
import type { Access, AddressSpace, Ptr } from './wgslTypes.ts';

export function ptrFn<T extends AnyData>(
  inner: T,
): Ptr<'function', T, 'read-write'> {
  return INTERNAL_createPtr('function', inner, 'read-write');
}

export function ptrPrivate<T extends AnyData>(
  inner: T,
): Ptr<'private', T, 'read-write'> {
  return INTERNAL_createPtr('private', inner, 'read-write');
}

export function ptrWorkgroup<T extends AnyData>(
  inner: T,
): Ptr<'workgroup', T, 'read-write'> {
  return INTERNAL_createPtr('workgroup', inner, 'read-write');
}

export function ptrStorage<
  T extends AnyData,
  TAccess extends 'read' | 'read-write' = 'read',
>(inner: T, access: TAccess = 'read' as TAccess): Ptr<'storage', T, TAccess> {
  return INTERNAL_createPtr('storage', inner, access);
}

export function ptrUniform<T extends AnyData>(
  inner: T,
): Ptr<'uniform', T, 'read'> {
  return INTERNAL_createPtr('uniform', inner, 'read');
}

export function ptrHandle<T extends AnyData>(
  inner: T,
): Ptr<'handle', T, 'read'> {
  return INTERNAL_createPtr('handle', inner, 'read');
}

function INTERNAL_createPtr<
  TAddressSpace extends AddressSpace,
  TInner extends AnyData,
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

  // // In the schema call, create and return a deep copy
  // // by wrapping all the values in corresponding schema calls.
  // const structSchema = (instanceProps?: TProps) =>
  //   Object.fromEntries(
  //     Object.entries(props).map(([key, schema]) => [
  //       key,
  //       instanceProps
  //         ? schemaCloneWrapper(schema, instanceProps[key])
  //         : schemaDefaultWrapper(schema),
  //     ]),
  //   );

  // Object.setPrototypeOf(structSchema, WgslStructImpl);
  // structSchema.propTypes = props;
  // Object.defineProperty(structSchema, $internal, {
  //   value: {
  //     isAbstruct,
  //   },
  // });

  // return structSchema as WgslStruct<TProps>;
}

// const WgslStructImpl = {
//   type: 'struct',

//   $name(label: string) {
//     setName(this, label);
//     return this;
//   },

//   toString(): string {
//     return `struct:${getName(this) ?? '<unnamed>'}`;
//   },
// };
