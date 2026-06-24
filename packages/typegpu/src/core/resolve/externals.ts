import { isLooseData } from '../../data/dataTypes.ts';
import { isWgslStruct } from '../../data/wgslTypes.ts';
import { getName, hasTinyestMetadata, isNamable, setName } from '../../shared/meta.ts';
import { isWgsl, type ResolutionCtx } from '../../types.ts';
import type { FnExternals } from '../function/fnCore.ts';

/**
 * A key-value mapping where keys represent identifiers within shader code,
 * and values can either be another ExternalMap, or be any type that can be resolved to a code string.
 */
export type ExternalMap = Record<string, unknown>;

function isResolvable(value: unknown) {
  return isWgsl(value) || isLooseData(value) || hasTinyestMetadata(value);
}

/**
 * Merges function externals into one map.
 */
export function mergeFunctionExternals(fnExternals: FnExternals): ExternalMap {
  const base = fnExternals.pluginProvided ?? fnExternals.userProvided ?? {};
  // avoid calling any of the getters
  const result: ExternalMap = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base));
  for (const flatExternal of [fnExternals.args, fnExternals.out].filter((e) => e !== undefined)) {
    for (const [key, value] of Object.entries(flatExternal)) {
      if (key in result && result[key] !== value) {
        throw new Error(
          `Key '${key}' appears in externals despite already being used for argument/return type. Please rename this external.`,
        );
      }
      result[key] = value;
    }
  }
  return result;
}

export function addArgTypesToExternals(
  implementation: string,
  argTypes: unknown[],
  core: { setExternals: (key: 'args', externals: ExternalMap) => void },
) {
  const argTypeNames = [...implementation.matchAll(/:\s*(?<arg>.*?)\s*[,)]/g)].map((found) =>
    found?.[1],
  );

  const args = Object.fromEntries(
    argTypes.flatMap((argType, i) => {
      const argTypeName = argTypeNames?.[i];
      return isWgslStruct(argType) && argTypeName !== undefined ? [[argTypeName, argType]] : [];
    }),
  );

  core.setExternals('args', args);
}

export function addReturnTypeToExternals(
  implementation: string,
  returnType: unknown,
  core: { setExternals: (key: 'out', externals: ExternalMap) => void },
) {
  const matched = implementation.match(/->\s(?<output>[\w\d_]+)\s{/);
  const outputName = matched ? matched[1]?.trim() : undefined;

  if (isWgslStruct(returnType) && outputName && !/\s/g.test(outputName)) {
    core.setExternals('out', { [outputName]: returnType });
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
    if (wgsl && externalName !== 'Out' && externalName !== 'in' && !externalRegex.test(wgsl)) {
      console.warn(`The external '${externalName}' wasn't used in the resolved template.`);
      // continue anyway, we still might need to resolve the external
    }

    if (isResolvable(external)) {
      if (isNamable(external) && getName(external) === undefined) {
        setName(external, externalName.split('.').at(-1) as string);
      }
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
