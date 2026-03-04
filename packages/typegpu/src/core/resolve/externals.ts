import { isLooseData } from '../../data/dataTypes.ts';
import { isWgslStruct } from '../../data/wgslTypes.ts';
import { getName, hasTinyestMetadata, setName } from '../../shared/meta.ts';
import { isWgsl, type ResolutionCtx } from '../../types.ts';

/**
 * A key-value mapping where keys represent identifiers within shader code,
 * and values can be any type that can be resolved to a code string.
 */
export type ExternalMap = Record<string, unknown>;

/**
 * Merges two external maps into one. If a key is present in both maps, the value from the new map is used.
 * If the external value is a namable object, it is given a name if it does not already have one.
 * @param existing - The existing external map.
 * @param newExternals - The new external map.
 */
export function applyExternals(existing: ExternalMap, newExternals: ExternalMap) {
  for (const [key, value] of Object.entries(newExternals)) {
    existing[key] = value;

    // Giving name to external value, if it does not already have one.
    if (
      value &&
      (typeof value === 'object' || typeof value === 'function') &&
      getName(value) === undefined
    ) {
      setName(value, key);
    }
  }
}

export function addArgTypesToExternals(
  implementation: string,
  argTypes: unknown[],
  applyExternals: (externals: ExternalMap) => void,
) {
  const argTypeNames = [...implementation.matchAll(/:\s*(?<arg>.*?)\s*[,)]/g)].map((found) =>
    found ? found[1] : undefined,
  );

  applyExternals(
    Object.fromEntries(
      argTypes.flatMap((argType, i) => {
        const argTypeName = argTypeNames ? argTypeNames[i] : undefined;
        return isWgslStruct(argType) && argTypeName !== undefined ? [[argTypeName, argType]] : [];
      }),
    ),
  );
}

export function addReturnTypeToExternals(
  implementation: string,
  returnType: unknown,
  applyExternals: (externals: ExternalMap) => void,
) {
  const matched = implementation.match(/->\s(?<output>[\w\d_]+)\s{/);
  const outputName = matched ? matched[1]?.trim() : undefined;

  if (isWgslStruct(returnType) && outputName && !/\s/g.test(outputName)) {
    applyExternals({ [outputName]: returnType });
  }
}

function identifierRegex(name: string) {
  return new RegExp(
    `(?<![\\w\\$_.])${name.replaceAll('.', '\\.').replaceAll('$', '\\$')}(?![\\w\\$_])`,
    'g',
  );
}

/**
 * Replaces all occurrences of external names in WGSL code with their resolved values.
 * It adds all necessary definitions to the resolution context.
 * @param ctx - The resolution context.
 * @param externalMap - The external map.
 * @param wgsl - The WGSL code.
 *
 * @returns The WGSL code with all external names replaced with their resolved values.
 */
export function replaceExternalsInWgsl(
  ctx: ResolutionCtx,
  externalMap: ExternalMap,
  wgsl: string,
): string {
  return Object.entries(externalMap).reduce((acc, [externalName, external]) => {
    const externalRegex = identifierRegex(externalName);
    if (wgsl && externalName !== 'Out' && externalName !== 'In' && !externalRegex.test(wgsl)) {
      console.warn(`The external '${externalName}' wasn't used in the resolved template.`);
      // continue anyway, we still might need to resolve the external
    }

    if (isWgsl(external) || isLooseData(external) || hasTinyestMetadata(external)) {
      return acc.replaceAll(externalRegex, ctx.resolve(external).value);
    }

    if (external !== null && typeof external === 'object') {
      const foundProperties = [
        ...wgsl.matchAll(
          new RegExp(
            `${externalName
              .replaceAll('.', '\\.')
              .replaceAll('$', '\\$')}\\.(?<prop>.*?)(?![\\w\\$_])`,
            'g',
          ),
        ),
      ].map((found) => found[1]);
      const uniqueProperties = [...new Set(foundProperties)];

      return uniqueProperties.reduce(
        (innerAcc: string, prop) =>
          prop && prop in external
            ? replaceExternalsInWgsl(
                ctx,
                {
                  [`${externalName}.${prop}`]: external[prop as keyof typeof external],
                },
                innerAcc,
              )
            : innerAcc,
        acc,
      );
    }

    console.warn(
      `During resolution, the external '${externalName}' has been omitted. Only TGPU resources, 'use gpu' functions, primitives, and plain JS objects can be used as externals.`,
    );

    return acc;
  }, wgsl);
}
