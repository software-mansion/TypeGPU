import { d, type TgpuFragmentFn, type TgpuVertexFn } from 'typegpu';

export function getCustomLocation(data: d.BaseData): number | undefined {
  return (data as unknown as d.Decorated | d.LooseDecorated).attribs?.find(d.isLocationAttrib)
    ?.params[0];
}
/**
 * Assumes vertexOut and fragmentIn are matching when it comes to the keys, that is fragmentIn's keyset is a subset of vertexOut's
 * Logs a warning, when they don't match in terms of custom locations
 */
export function matchUpVaryingLocations(
  vertexOut: TgpuVertexFn.Out | undefined = {},
  fragmentIn: TgpuFragmentFn.In | undefined = {},
  vertexFnName: string,
  fragmentFnName: string,
) {
  const locations: Record<string, number> = {};
  const usedLocations = new Set<number>();

  function saveLocation(key: string, location: number) {
    locations[key] = location;
    usedLocations.add(location);
  }

  // respect custom locations and pair up vertex and fragment varying with the same key
  for (const [key, value] of Object.entries(vertexOut)) {
    const customLocation = getCustomLocation(value);
    if (customLocation !== undefined) {
      saveLocation(key, customLocation);
    }
  }

  for (const [key, value] of Object.entries(fragmentIn)) {
    const customLocation = getCustomLocation(value);
    if (customLocation === undefined) {
      continue;
    }

    if (locations[key] === undefined) {
      saveLocation(key, customLocation);
    } else if (locations[key] !== customLocation) {
      console.warn(
        `Mismatched location between vertexFn (${vertexFnName}) output (${
          locations[key]
        }) and fragmentFn (${fragmentFnName}) input (${customLocation}) for the key "${key}", using the location set on vertex output.`,
      );
    }
  }

  // automatically assign remaining locations to the rest
  let nextLocation = 0;
  for (const key of Object.keys(vertexOut ?? {})) {
    if (d.isBuiltin(vertexOut[key]) || locations[key] !== undefined) {
      continue;
    }

    while (usedLocations.has(nextLocation)) {
      nextLocation++;
    }

    saveLocation(key, nextLocation);
  }

  return locations;
}
