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

/**
 * Assigns locations to members.
 * The priority of assigned location is as follows:
 * - location already present in member,
 * - location provided in {@argument locations},
 * - a free number.
 *
 * Assumes {@argument locations} are consistent with already decorated {@argument members}.
 */
export function withLocations<T extends BaseData>(
  members: Record<string, T> | undefined,
  locations: Record<string, number> = {},
  autoInterpolateIntegers = false,
): Record<string, BaseData> {
  let nextLocation = 0;
  const usedCustomLocations = new Set<number>([
    ...Object.values(locations),
    ...Object.values(members ?? {})
      .map(getCustomLocation)
      .filter((v) => v !== undefined),
  ]);

  return Object.fromEntries(
    Object.entries(members ?? {}).map(([key, member]) => {
      if (isBuiltin(member)) {
        // skipping builtins
        return [key, member];
      }

      if (getCustomLocation(member) !== undefined) {
        // this member is already marked
        return [key, member];
      }

      if (locations[key] !== undefined) {
        // location has been determined by a previous procedure
        return [key, location(locations[key], member)];
      }

      while (usedCustomLocations.has(nextLocation)) {
        nextLocation++;
      }

      const interpolated = autoInterpolateIntegers
        ? withFlatInterpolationForInteger(member)
        : member;

      return [key, location(nextLocation++, interpolated)];
    }),
  );
}

export function separateBuiltins(
  schema: Record<string, BaseData>,
  locations: Record<string, number> = {},
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
      ? INTERNAL_createStruct(withLocations(dataFields, locations), /* isAbstruct */ false)
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

    return (
      getCustomLocation(layout) !== undefined ? layout : location(0, layout)
    ) as IOLayoutToSchema<T>;
  }

  return INTERNAL_createStruct(
    withLocations(layout as Record<string, BaseData>, locations, autoInterpolateIntegers),
    /* isAbstruct */ false,
  ) as IOLayoutToSchema<T>;
}

function needsFlatInterpolation(data: BaseData): boolean {
  if (isBuiltin(data) || (isDecorated(data) && data.attribs.some(isInterpolateAttrib))) {
    return false;
  }

  const inner = isDecorated(data) ? data.inner : data;
  return isInteger(inner) || isIntegerVec(inner);
}

function withFlatInterpolationForInteger(data: BaseData): BaseData {
  return needsFlatInterpolation(data) ? interpolate('flat', data as FlatInterpolatableData) : data;
}

/**
 * WGSL requires integer inter-stage values to be flat interpolated. Interpolation is only
 * inferred for shellless entry functions, so shells have to specify it explicitly.
 */
export function assertIntegerVaryingsInterpolated(
  layout: BaseData | Record<string, BaseData> | undefined,
  location: string,
) {
  if (layout === undefined || isData(layout)) {
    // A single value is either a builtin or a fragment output, neither are varyings
    return;
  }

  for (const [key, member] of Object.entries(layout)) {
    if (needsFlatInterpolation(member)) {
      throw new Error(
        `Integer value "${key}" in ${location} requires flat interpolation. Wrap its schema in d.interpolate('flat', ...) or d.interpolate('flat, either', ...).`,
      );
    }
  }
}
