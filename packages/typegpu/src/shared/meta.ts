// The version is inlined during build-time 🎉
import { version } from '../../package.json';
import { DEV, TEST } from './env.ts';
import { $getNameForward, isMarkedInternal } from './symbols.ts';
import { normalizeMetadata, type FunctionMetadata, type RawMetadata } from './normalizeMetadata.ts';

// --- globalExt ---
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
  __TYPEGPU_VERSION__?: string;
  __TYPEGPU_META__?: WeakMap<object, RawMetadata>;
  __TYPEGPU_AUTONAME__?: <T>(exp: T, label: string) => T;
  __TYPEGPU_MEASURE_PERF__?: boolean | undefined;
  __TYPEGPU_PERF_RECORDS__?: Map<string, unknown[]>;
};

const globalExt = globalThis as INTERNAL_GlobalExt;
if (globalExt.__TYPEGPU_VERSION__ !== undefined) {
  console.warn(
    `Found duplicate TypeGPU version. First was ${globalExt.__TYPEGPU_VERSION__}, this one is ${version}. This may cause unexpected behavior.`,
  );
}
globalExt.__TYPEGPU_VERSION__ = version;
globalExt.__TYPEGPU_AUTONAME__ = <T>(exp: T, label: string): T =>
  isNamable(exp) && isMarkedInternal(exp) && !getName(exp) ? exp.$name(label) : exp;

// --- NAMING ---
const nameMap = new WeakMap<object, string>();

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

function isForwarded(value: unknown): value is { [$getNameForward]: unknown } {
  return !!(value as { [$getNameForward]?: unknown })?.[$getNameForward];
}

export function getName(definition: unknown): string | undefined {
  if (isForwarded(definition)) {
    return getName(definition[$getNameForward]);
  }
  return (
    nameMap.get(definition as object) ?? globalExt.__TYPEGPU_META__?.get(definition as object)?.name
  );
}

export function setName(definition: object, name: string): void {
  if (isForwarded(definition)) {
    setName(definition[$getNameForward] as object, name);
    return;
  }
  nameMap.set(definition, name);
}

// --- METADATA ---
const metadataMap = new WeakMap<object, FunctionMetadata>();

/**
 * Retrieves normalized (non-raw) function metadata.
 * If `globalExt.__TYPEGPU_META__` contains raw metadata for the function,
 * it is normalized, and then deleted to avoid unnecessary re-normalization.
 */
export function getFunctionMetadata(definition: object): FunctionMetadata {
  // it's fine, if it's not an object, the get will return undefined
  const maybeRawMeta = globalExt.__TYPEGPU_META__?.get(definition);
  if (maybeRawMeta) {
    globalExt.__TYPEGPU_META__?.delete(definition);
    const normalized = normalizeMetadata(maybeRawMeta);
    metadataMap.set(definition, normalized);
    if (maybeRawMeta.name && nameMap.get(definition) === undefined) {
      nameMap.set(definition, maybeRawMeta.name);
    }
  }
  return metadataMap.get(definition) ?? {};
}

/**
 * AST's are given to functions with a 'use gpu' directive, which this function checks for.
 */
export function hasTinyestMetadata(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function' && !!getFunctionMetadata(value)?.ast;
}

// --- PERF ---
/**
 * Performance measurements are only enabled in dev & test environments for now
 */
export const PERF =
  ((DEV || TEST) && {
    get enabled() {
      return !!globalExt.__TYPEGPU_MEASURE_PERF__;
    },
    record(name: string, data: unknown) {
      const records = (globalExt.__TYPEGPU_PERF_RECORDS__ ??= new Map());
      let entries = records.get(name);
      if (!entries) {
        entries = [];
        records.set(name, entries);
      }
      entries.push(data);
    },
  }) ||
  undefined;
