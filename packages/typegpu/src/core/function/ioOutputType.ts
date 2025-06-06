import {
  type Decorate,
  type HasCustomLocation,
  type IsBuiltin,
  location,
} from '../../data/attributes.ts';
import { isBuiltin } from '../../data/attributes.ts';
import { getCustomLocation, isData } from '../../data/dataTypes.ts';
import { struct } from '../../data/struct.ts';
import {
  type BaseData,
  isVoid,
  type Location,
  type WgslStruct,
} from '../../data/wgslTypes.ts';
import type { IOData, IOLayout, IORecord } from './fnTypes.ts';

export type WithLocations<T extends IORecord> = {
  [Key in keyof T]: IsBuiltin<T[Key]> extends true ? T[Key]
    : HasCustomLocation<T[Key]> extends true ? T[Key]
    : Decorate<T[Key], Location>;
};

export type IOLayoutToSchema<T extends IOLayout> = T extends BaseData
  ? Decorate<T, Location<0>>
  : T extends IORecord ? WgslStruct<WithLocations<T>>
  // biome-ignore lint/suspicious/noConfusingVoidType: <it actually is void>
  : T extends { type: 'void' } ? void
  : never;

export function withLocations<T extends IOData>(
  members: IORecord<T>,
): WithLocations<IORecord<T>> {
  let nextLocation = 0;

  return Object.fromEntries(
    Object.entries(members).map(([key, member]) => {
      if (isBuiltin(member)) {
        // Skipping builtins
        return [key, member];
      }

      const customLocation = getCustomLocation(member);
      if (customLocation !== undefined) {
        // This member is already marked, start counting from the next location over.
        nextLocation = customLocation + 1;
        return [key, member];
      }

      return [key, location(nextLocation++, member)];
    }),
  );
}

export function createIoSchema<
  T extends IOData,
  Layout extends IORecord<T> | IOLayout<T>,
>(returnType: Layout) {
  return (
    isData(returnType)
      ? isVoid(returnType)
        ? returnType
        : getCustomLocation(returnType) !== undefined
        ? returnType
        : location(0, returnType)
      : struct(withLocations(returnType) as Record<string, T>)
  ) as IOLayoutToSchema<Layout>;
}
