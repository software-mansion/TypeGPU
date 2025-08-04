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
  members: IORecord<T> | undefined,
  locations: Record<string, number> = {},
): WithLocations<IORecord<T>> {
  let nextLocation = 0;
  const usedCustomLocations = new Set<number>();

  return Object.fromEntries(
    Object.entries(members ?? {}).map(([key, member]) => {
      const customLocation = getCustomLocation(member);

      if (customLocation !== undefined) {
        if (usedCustomLocations.has(customLocation)) {
          throw new Error('Duplicate custom location attributes found');
        }
        usedCustomLocations.add(customLocation);
      }

      return [key, member] as const;
    }).map(([key, member]) => {
      if (isBuiltin(member)) { // skipping builtins
        return [key, member];
      }

      if (getCustomLocation(member) !== undefined) { // this member is already marked
        return [key, member];
      }

      if (locations[key]) { // location has been determined by a previous procedure
        return [key, location(locations[key], member)];
      }

      while (usedCustomLocations.has(nextLocation)) {
        nextLocation++;
      }
      return [key, location(nextLocation++, member)];
    }),
  );
}

export function createIoSchema<
  T extends IOData,
  Layout extends IORecord<T> | IOLayout<T>,
>(layout: Layout, locations: Record<string, number> = {}) {
  return (
    isData(layout)
      ? isVoid(layout)
        ? layout
        : getCustomLocation(layout) !== undefined
        ? layout
        : location(0, layout)
      : struct(withLocations(layout, locations) as Record<string, T>)
  ) as IOLayoutToSchema<Layout>;
}
