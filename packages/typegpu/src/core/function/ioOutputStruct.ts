import { isBuiltin, struct } from '../../data';
import { attribute, location } from '../../data/attributes';
import { getCustomLocation, isData } from '../../data/dataTypes';
import type { BaseWgslData, WgslStruct } from '../../data/wgslTypes';
import type { FnCore } from './fnCore';
import type { IOData, IOLayout, Implementation } from './fnTypes';

export type IOLayoutToOutputStruct<T extends IOLayout> = T extends BaseWgslData
  ? WgslStruct<{ out: T }>
  : T extends Record<string, BaseWgslData>
    ? WgslStruct<T>
    : never;

export function withLocations(
  members: Record<string, BaseWgslData>,
): Record<string, BaseWgslData> {
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

      return [
        key,
        attribute(member, { type: '@location', value: nextLocation++ }),
      ];
    }),
  );
}

export function createOutputStruct<T extends IOData>(
  core: FnCore,
  implementation: Implementation,
  returnType: IOLayout<T>,
) {
  const Output = struct(
    withLocations(
      isData(returnType) ? { out: location(0, returnType) } : returnType,
    ) as Record<string, T>,
  );

  if (typeof implementation === 'string') {
    const outputName = implementation
      .match(/->(?<output>.*?){/s)
      ?.groups?.output?.trim();

    if (outputName && !/\s/g.test(outputName)) {
      core.applyExternals({
        [outputName]: Output,
      });
    }
  }

  return Output;
}
