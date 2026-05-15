// The version is inlined during build-time 🎉
import { version } from '../../package.json';
import type { Block, FuncParameter } from 'tinyest';
import { DEV, TEST } from './env.ts';
import { $getNameForward, isMarkedInternal } from './symbols.ts';

// TODO: check external names
// TODO: what needs to be exported?
export interface RawMetadataV1 {
  v: 1;
  name?: string | undefined;
  ast?: { params: FuncParameter[]; body: Block; externalNames: string[] } | undefined;
  externals?:
    // Passing a record happens prior to version 0.9.0
    Record<string, unknown> | (() => Record<string, unknown>) | undefined;
}

export interface ExternalsV2 {
  [key: string]: ExternalsV2 | (() => unknown);
}

export interface RawMetadataV2 {
  v: 2;
  name?: string | undefined;
  ast?: { params: FuncParameter[]; body: Block; externalNames: string[] } | undefined;
  externals?: ExternalsV2;
}

export type RawMetadata = RawMetadataV1 | RawMetadataV2;

export interface MetaData {
  ast?: { params: FuncParameter[]; body: Block; externalNames: string[] } | undefined;
  externals?: Record<string, unknown> | undefined;
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
  __TYPEGPU_META__: WeakMap<object, RawMetadata>;
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
  isNamable(exp) && isMarkedInternal(exp) && !getName(exp) ? exp.$name(label) : exp;

/**
 * Performance measurements are only enabled in dev & test environments for now
 */
export const PERF =
  ((DEV || TEST) && {
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
  }) ||
  undefined;

function isForwarded(value: unknown): value is { [$getNameForward]: unknown } {
  return !!(value as { [$getNameForward]?: unknown })?.[$getNameForward];
}

export function getName(definition: unknown): string | undefined {
  if (isForwarded(definition)) {
    return getName(definition[$getNameForward]);
  }
  return (
    nameMap.get(definition as object) ??
    globalWithMeta.__TYPEGPU_META__?.get(definition as object)?.name
  );
}

export function setName(definition: object, name: string | undefined): void {
  if (!name) {
    return;
  }
  if (isForwarded(definition)) {
    setName(definition[$getNameForward] as object, name);
    return;
  }
  nameMap.set(definition, name);
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
export function hasTinyestMetadata(value: unknown): value is (...args: never[]) => unknown {
  return !!getMetaData(value)?.ast;
}

// TODO: deslopify, document, make sure it works as intended
export function normalizeExternalsV2(ext2: ExternalsV2): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ext2)) {
    if (typeof value === 'function') {
      Object.defineProperty(result, key, {
        get: value,
        enumerable: true,
      });
    } else {
      result[key] = normalizeExternalsV2(value);
    }
  }
  return result;
}

export function normalizeMetadata(meta: RawMetadata): MetaData {
  if (meta.v === 1) {
    const externals = typeof meta?.externals === 'function' ? meta.externals() : meta?.externals;
    return { ...meta, externals };
  }

  // if (meta.v === 2) {
  //   const externals = meta?.externals ? normalizeExternalsV2(meta?.externals) : undefined;
  //   return { ...meta, externals };
  // }

  throw new Error(`Unrecognized TypeGPU metadata format: ${JSON.stringify(meta)}`);
}

const metadataMap = new WeakMap<object, MetaData>();
const nameMap = new WeakMap<object, string>();

export function getMetaData(definition: unknown): MetaData & { name: string | undefined } {
  // it's fine, if it's not an object, the get will return undefined
  const maybeRawMeta = globalWithMeta.__TYPEGPU_META__?.get(definition as object);
  if (maybeRawMeta) {
    globalWithMeta.__TYPEGPU_META__?.delete(definition as object);
    const normalized = normalizeMetadata(maybeRawMeta);
    metadataMap.set(definition as object, normalized);
    if (maybeRawMeta.name && nameMap.get(definition as object) === undefined) {
      nameMap.set(definition as object, maybeRawMeta.name);
    }
  }
  return { ...metadataMap.get(definition as object), name: nameMap.get(definition as object) };
}
