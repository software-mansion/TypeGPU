import {
  type Decorate,
  type HasCustomLocation,
  type IsBuiltin,
  location,
} from '../../data/attributes.ts';
import { isBuiltin } from '../../data/attributes.ts';
import { getCustomLocation, isData } from '../../data/dataTypes.ts';
import { INTERNAL_createStruct } from '../../data/struct.ts';
import { type BaseData, isVoid, type Location, type WgslStruct } from '../../data/wgslTypes.ts';

export type WithLocations<T extends Record<string, BaseData>> = {
  [Key in keyof T]: IsBuiltin<T[Key]> extends true
    ? T[Key]
    : HasCustomLocation<T[Key]> extends true
      ? T[Key]
      : Decorate<T[Key], Location>;
};

export type IOLayoutToSchema<T> = T extends BaseData
  ? HasCustomLocation<T> extends true
    ? T
    : Decorate<T, Location<0>>
  : T extends Record<string, BaseData>
    ? WgslStruct<WithLocations<T>>
    : T extends { type: 'void' }
      ? void
      : never;

export function withLocations<T extends BaseData>(
  members: Record<string, T> | undefined,
  locations: Record<string, number> = {},
): Record<string, BaseData> {
  let nextLocation = 0;
  const usedCustomLocations = new Set<number>();

  return Object.fromEntries(
    Object.entries(members ?? {})
      .map(([key, member]) => {
        const customLocation = getCustomLocation(member);

        if (customLocation !== undefined) {
          if (usedCustomLocations.has(customLocation)) {
            throw new Error('Duplicate custom location attributes found');
          }
          usedCustomLocations.add(customLocation);
        }

        return [key, member] as const;
      })
      .map(([key, member]) => {
        if (isBuiltin(member)) {
          // skipping builtins
          return [key, member];
        }

        if (getCustomLocation(member) !== undefined) {
          // this member is already marked
          return [key, member];
        }

        if (locations[key]) {
          // location has been determined by a previous procedure
          return [key, location(locations[key], member)];
        }

        while (usedCustomLocations.has(nextLocation)) {
          nextLocation++;
        }
        return [key, location(nextLocation++, member)];
      }),
  );
}

export function createIoSchema<T extends BaseData | Record<string, BaseData>>(
  layout: T,
  locations: Record<string, number> = {},
) {
  return (
    isData(layout)
      ? isVoid(layout)
        ? layout
        : isBuiltin(layout)
          ? layout
          : getCustomLocation(layout) !== undefined
            ? layout
            : location(0, layout)
      : INTERNAL_createStruct(
          withLocations(layout as Record<string, BaseData>, locations),
          /* isAbstruct */ false,
        )
  ) as IOLayoutToSchema<T>;
}
