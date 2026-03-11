// Copied from https://github.com/unjs/unplugin/blob/f514bf8e2d751b48b3a5acb1077eb1292d9711b3/src/utils/filter.ts#L2
// Used only in the babel version of the plugin, since others can rely on native unplugin functionality.

import { resolve } from 'pathe';
import picomatch from 'picomatch';
import type { Arrayable, Nullable, StringFilter, StringOrRegExp } from 'unplugin';

function toArray<T>(array?: Nullable<Arrayable<T>>): Array<T> {
  const result = array || [];
  if (Array.isArray(result)) return result;
  return [result];
}

const BACKSLASH_REGEX = /\\/g;
function normalize(path: string): string {
  return path.replace(BACKSLASH_REGEX, '/');
}

const ABSOLUTE_PATH_REGEX = /^(?:\/|(?:[A-Z]:)?[/\\|])/i;
function isAbsolute(path: string): boolean {
  return ABSOLUTE_PATH_REGEX.test(path);
}

export type PluginFilter = (input: string) => boolean;
export type TransformHookFilter = (id: string, code: string) => boolean;

interface NormalizedStringFilter {
  include?: StringOrRegExp[] | undefined;
  exclude?: StringOrRegExp[] | undefined;
}

function getMatcherString(glob: string, cwd: string) {
  if (glob.startsWith('**') || isAbsolute(glob)) {
    return normalize(glob);
  }

  const resolved = resolve(cwd, glob);
  return normalize(resolved);
}

function patternToIdFilter(pattern: StringOrRegExp): PluginFilter {
  if (pattern instanceof RegExp) {
    return (id: string) => {
      const normalizedId = normalize(id);
      const result = pattern.test(normalizedId);
      pattern.lastIndex = 0;
      return result;
    };
  }
  const cwd = process.cwd();
  const glob = getMatcherString(pattern, cwd);
  const matcher = picomatch(glob, { dot: true });
  return (id: string) => {
    const normalizedId = normalize(id);
    return matcher(normalizedId);
  };
}

function createFilter(
  exclude: PluginFilter[] | undefined,
  include: PluginFilter[] | undefined,
): PluginFilter | undefined {
  if (!exclude && !include) {
    return;
  }

  return (input) => {
    if (exclude?.some((filter) => filter(input))) {
      return false;
    }
    if (include?.some((filter) => filter(input))) {
      return true;
    }
    return !(include && include.length > 0);
  };
}

function normalizeFilter(filter: StringFilter): NormalizedStringFilter {
  if (typeof filter === 'string' || filter instanceof RegExp) {
    return {
      include: [filter],
    };
  }
  if (Array.isArray(filter)) {
    return {
      include: filter,
    };
  }
  return {
    exclude: filter.exclude ? toArray(filter.exclude) : undefined,
    include: filter.include ? toArray(filter.include) : undefined,
  };
}

function createIdFilter(filter: StringFilter | undefined): PluginFilter | undefined {
  if (!filter) return;
  const { exclude, include } = normalizeFilter(filter);
  const excludeFilter = exclude?.map(patternToIdFilter);
  const includeFilter = include?.map(patternToIdFilter);
  return createFilter(excludeFilter, includeFilter);
}

export function createFilterForId(filter: StringFilter | undefined): PluginFilter | undefined {
  const filterFunction = createIdFilter(filter);
  return filterFunction ? (id) => !!filterFunction(id) : undefined;
}
