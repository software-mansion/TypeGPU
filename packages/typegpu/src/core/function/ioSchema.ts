import {
  type Decorate,
  type HasCustomLocation,
  type IsBuiltin,
  interpolate,
  location,
} from '../../data/attributes.ts';
import { isBuiltin } from '../../data/attributes.ts';
import { getCustomLocation, isData } from '../../data/dataTypes.ts';
import { INTERNAL_createStruct } from '../../data/struct.ts';
import {
  type BaseData,
  type FlatInterpolatableData,
  isDecorated,
  isInteger,
  isIntegerVec,
  isInterpolateAttrib,
  isVoid,
  type Location,
  type WgslStruct,
} from '../../data/wgslTypes.ts';
import type { SeparatedEntryArgs } from './fnTypes.ts';

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
  autoInterpolateIntegers = false,
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

        return [
          key,
          autoInterpolateIntegers && !isBuiltin(member)
            ? withFlatInterpolationForInteger(member)
            : member,
        ] as const;
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

export function separateBuiltins(
  schema: Record<string, BaseData>,
  locations: Record<string, number> = {},
  autoInterpolateIntegers = false,
): SeparatedEntryArgs {
  const positionalArgs: SeparatedEntryArgs['positionalArgs'] = [];
  const dataFields: Record<string, BaseData> = {};

  for (const [key, type] of Object.entries(schema)) {
    if (isBuiltin(type)) {
      positionalArgs.push({ schemaKey: key, type });
    } else {
      dataFields[key] = type;
    }
  }

  const dataSchema =
    Object.keys(dataFields).length > 0
      ? INTERNAL_createStruct(
          withLocations(dataFields, locations, autoInterpolateIntegers),
          /* isAbstruct */ false,
        )
      : undefined;

  return { dataSchema, positionalArgs };
}

export function separateAllAsPositional(schema: Record<string, BaseData>): SeparatedEntryArgs {
  const withLocs = withLocations(schema);
  const positionalArgs = Object.entries(withLocs).map(([key, type]) => ({ schemaKey: key, type }));
  return { dataSchema: undefined, positionalArgs };
}

export function createIoSchema<T extends BaseData | Record<string, BaseData>>(
  layout: T,
  locations: Record<string, number> = {},
  autoInterpolateIntegers = false,
) {
  if (isData(layout)) {
    if (isVoid(layout) || isBuiltin(layout)) {
      return layout as unknown as IOLayoutToSchema<T>;
    }

    const data = autoInterpolateIntegers ? withFlatInterpolationForInteger(layout) : layout;
    return (
      getCustomLocation(data) !== undefined ? data : location(0, data)
    ) as IOLayoutToSchema<T>;
  }

  return INTERNAL_createStruct(
    withLocations(layout as Record<string, BaseData>, locations, autoInterpolateIntegers),
    /* isAbstruct */ false,
  ) as IOLayoutToSchema<T>;
}

function withFlatInterpolationForInteger(data: BaseData): BaseData {
  if (isDecorated(data) && data.attribs.some(isInterpolateAttrib)) {
    return data;
  }

  const inner = isDecorated(data) ? data.inner : data;
  return isInteger(inner) || isIntegerVec(inner)
    ? interpolate('flat', data as FlatInterpolatableData)
    : data;
}
