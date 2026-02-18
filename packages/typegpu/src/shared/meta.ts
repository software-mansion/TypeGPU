// The version is inlined during build-time 🎉
import { version } from '../../package.json';
import type { Block, FuncParameter } from 'tinyest';
import { DEV, TEST } from './env.ts';
import { $getNameForward, isMarkedInternal } from './symbols.ts';

export interface MetaData {
  v?: number;
  name?: string | undefined;
  ast?: {
    params: FuncParameter[];
    body: Block;
    externalNames: string[];
  } | undefined;
  externals?:
    // Passing a record happens prior to version 0.9.0
    // TODO: Support for this can be removed down the line
    | Record<string, unknown>
    | (() => Record<string, unknown>)
    | undefined;
}

/**
 * Don't use or you WILL get fired from your job.
 *
 * The information that this type describes is additional
 * properties that we add onto `globalThis`, used by tools
 * like `unplugin-typegpu` or our test suite.
 *
 * @internal
 */
export type INTERNAL_GlobalExt = typeof globalThis & {
  __TYPEGPU_VERSION__: string | undefined;
  __TYPEGPU_META__: WeakMap<object, MetaData>;
  __TYPEGPU_AUTONAME__: <T>(exp: T, label: string) => T;
  __TYPEGPU_MEASURE_PERF__?: boolean | undefined;
  __TYPEGPU_PERF_RECORDS__?: Map<string, unknown[]> | undefined;
};

const globalWithMeta = globalThis as INTERNAL_GlobalExt;

if (globalWithMeta.__TYPEGPU_VERSION__ !== undefined) {
  console.warn(
    `Found duplicate TypeGPU version. First was ${globalWithMeta.__TYPEGPU_VERSION__}, this one is ${version}. This may cause unexpected behavior.`,
  );
}

globalWithMeta.__TYPEGPU_VERSION__ = version;
globalWithMeta.__TYPEGPU_AUTONAME__ = <T>(exp: T, label: string): T =>
  isNamable(exp) && isMarkedInternal(exp) && !getName(exp)
    ? exp.$name(label)
    : exp;

/**
 * Performance measurements are only enabled in dev & test environments for now
 */
export const PERF = (DEV || TEST) && ({
      get enabled() {
        return !!globalWithMeta.__TYPEGPU_MEASURE_PERF__;
      },
      record(name: string, data: unknown) {
        const records = (globalWithMeta.__TYPEGPU_PERF_RECORDS__ ??= new Map());
        let entries = records.get(name);
        if (!entries) {
          entries = [];
          records.set(name, entries);
        }
        entries.push(data);
      },
    }) || undefined;

function isForwarded(value: unknown): value is { [$getNameForward]: unknown } {
  return !!(value as { [$getNameForward]?: unknown })?.[$getNameForward];
}

export function getName(definition: unknown): string | undefined {
  if (isForwarded(definition)) {
    return getName(definition[$getNameForward]);
  }
  return getMetaData(definition)?.name;
}

export function setName(definition: object, name: string | undefined): void {
  if (isForwarded(definition)) {
    setName(definition[$getNameForward] as object, name);
    return;
  }
  setMetaData(definition, { name });
}

/**
 * Can be assigned a name. Not to be confused with just having a name.
 * The `$name` function should use `setName` to rename the object itself,
 * even if `$getNameForward` symbol is present.
 */
export interface TgpuNamable {
  $name(label: string): this;
}

export function isNamable(value: unknown): value is TgpuNamable {
  return !!(value as TgpuNamable)?.$name;
}

/**
 * AST's are given to functions with a 'use gpu' directive, which this function checks for.
 */
export function hasTinyestMetadata(
  value: unknown,
): value is (...args: never[]) => unknown {
  return !!getMetaData(value)?.ast;
}

export function getMetaData(
  definition: unknown,
): MetaData | undefined {
  return globalWithMeta.__TYPEGPU_META__.get(
    // it's fine, if it's not an object, the get will return undefined
    definition as object,
  );
}

export function setMetaData(definition: object, metaData: object) {
  globalWithMeta.__TYPEGPU_META__ ??= new WeakMap();
  const map = globalWithMeta.__TYPEGPU_META__;
  map.set(definition, { ...map.get(definition), ...metaData });
}
