import {
  type Decorate,
  type HasCustomLocation,
  type IsBuiltin,
  interpolate,
  location,
} from '../../data/attributes.ts';
import { isBuiltin } from '../../data/attributes.ts';
import { getCustomLocation, isData, undecorate } from '../../data/dataTypes.ts';
import { INTERNAL_createStruct } from '../../data/struct.ts';
import {
  type BaseData,
  type FlatInterpolatableData,
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

const integerVaryingTypes = new Set([
  'i32',
  'u32',
  'vec2i',
  'vec2u',
  'vec3i',
  'vec3u',
  'vec4i',
  'vec4u',
]);

export type IoSchemaOptions = {
  readonly autoInterpolateIntegerVaryings?: boolean;
};

function hasInterpolation(data: BaseData) {
  return (data as { attribs?: unknown[] }).attribs?.some(isInterpolateAttrib) ?? false;
}

function maybeInterpolateIntegerVarying(data: BaseData, options: IoSchemaOptions) {
  if (!options.autoInterpolateIntegerVaryings || hasInterpolation(data)) {
    return data;
  }

  return integerVaryingTypes.has(undecorate(data).type)
    ? interpolate('flat', data as FlatInterpolatableData)
    : data;
}

export function withLocations<T extends BaseData>(
  members: Record<string, T> | undefined,
  locations: Record<string, number> = {},
  options: IoSchemaOptions = {},
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
        const memberWithInterpolation = maybeInterpolateIntegerVarying(member, options);

        if (getCustomLocation(member) !== undefined) {
          // this member is already marked
          return [key, memberWithInterpolation];
        }

        if (locations[key]) {
          // location has been determined by a previous procedure
          return [key, location(locations[key], memberWithInterpolation)];
        }

        while (usedCustomLocations.has(nextLocation)) {
          nextLocation++;
        }
        return [key, location(nextLocation++, memberWithInterpolation)];
      }),
  );
}

export function separateBuiltins(
  schema: Record<string, BaseData>,
  locations: Record<string, number> = {},
  options: IoSchemaOptions = {},
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
      ? INTERNAL_createStruct(withLocations(dataFields, locations, options), /* isAbstruct */ false)
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
  options: IoSchemaOptions = {},
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
          withLocations(layout as Record<string, BaseData>, locations, options),
          /* isAbstruct */ false,
        )
  ) as IOLayoutToSchema<T>;
}
